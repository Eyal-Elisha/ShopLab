"""General endpoint discovery scanner."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Tuple

from utils.fingerprint import fingerprint_target
from utils.http_client import (
    HttpClient,
    extract_html_urls,
    extract_js_endpoints,
    paths_from_openapi,
    urls_from_route_catalog,
)
from utils.owasp_taxonomy import label

from .base import BaseScanner, Finding


class DiscoveryScanner(BaseScanner):
    name = "discovery"
    binary = ""

    def is_available(self) -> bool:
        return True

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        client = HttpClient(
            self.ctx.target_url,
            timeout=int(self.ctx.extras.get("http_timeout", 10)),
            delay=float(self.ctx.extras.get("request_delay", 0.0)),
        )
        endpoints = list(dict.fromkeys(self.ctx.extras.get("endpoints") or [self.ctx.target_url]))
        discovered: List[str] = []
        base_root = self.ctx.target_url.rstrip("/") + "/"

        fp = fingerprint_target(client, self.ctx.target_url)
        self.ctx.extras["fingerprint"] = {
            "target": fp.target,
            "spa": fp.spa,
            "framework_hints": fp.framework_hints,
            "cookie_hints": fp.cookie_hints,
            "api_style": fp.api_style,
            "auth_style": fp.auth_style,
            "candidate_paths": fp.candidate_paths,
            "notes": fp.notes,
        }
        for cand in fp.candidate_paths:
            if cand.startswith(("http://", "https://")):
                discovered.append(cand)
            else:
                discovered.append(base_root + cand.lstrip("/"))

        for rel in ("api", "api/"):
            res = client.get(rel)
            if not res or res.status != 200:
                continue
            parsed = res.json()
            if not isinstance(parsed, dict):
                continue
            catalog_hint = parsed.get("endpoints") or parsed.get("routes")
            extra_urls = urls_from_route_catalog(parsed, base_root)
            if extra_urls:
                catalog_url = client.resolve(rel.rstrip("/"))
                discovered.append(catalog_url)
                discovered.extend(extra_urls)
            elif isinstance(catalog_hint, (dict, list)):
                discovered.append(client.resolve(rel.rstrip("/")))

        for url in endpoints[: int(self.ctx.extras.get("discovery_max_pages", 25))]:
            res = client.get(url)
            if not res:
                continue
            for found in extract_html_urls(res.body, res.url):
                discovered.append(found)
            script_urls = [u for u in extract_html_urls(res.body, res.url) if u.endswith(".js")]
            for script_url in script_urls[: int(self.ctx.extras.get("discovery_max_scripts", 10))]:
                script = client.get(script_url)
                if script:
                    discovered.extend(extract_js_endpoints(script.body, script.url))

        for api_doc in ("api-docs/swagger.json", "swagger.json", "openapi.json", "api-docs/"):
            res = client.get(api_doc)
            if not res or res.status >= 500:
                continue
            parsed = res.json()
            if parsed is None and "swagger" in res.body.lower():
                try:
                    parsed = json.loads(res.body)
                except json.JSONDecodeError:
                    parsed = None
            if parsed:
                discovered.extend(paths_from_openapi(parsed, self.ctx.target_url.rstrip("/") + "/"))

        merged = list(dict.fromkeys([*endpoints, *discovered]))
        self.ctx.extras["endpoints"] = merged
        out = self.raw_path("discovered_endpoints.json")
        out.write_text(json.dumps(merged, indent=2), encoding="utf-8")

        findings: List[Finding] = []
        for url in discovered[: int(self.ctx.extras.get("discovery_finding_limit", 30))]:
            findings.append(
                self.make_finding(
                    type_="Discovered Endpoint",
                    severity="info",
                    endpoint=url,
                    description="Endpoint discovered by HTML/script/OpenAPI/fingerprint heuristics.",
                    owasp=label("API:9"),
                    confidence="medium",
                    evidence=url,
                    remediation="Maintain an API inventory and remove or protect unused endpoints.",
                    validated=True,
                )
            )

        self.log.info("discovery added %d endpoint(s)", len(merged) - len(endpoints))
        return out, findings
