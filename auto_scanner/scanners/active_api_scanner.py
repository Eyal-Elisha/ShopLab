"""Active API probes: schema leak, unauthenticated JSON, BOLA hints, OPTIONS, auth-diff."""

from __future__ import annotations

import json
from typing import Any, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

from utils.http_client import HttpClient, interesting_json_keys, json_contains_sensitive_keys
from utils.owasp_taxonomy import label

from .base import BaseScanner, Finding


class ActiveApiScanner(BaseScanner):
    name = "active_api"
    binary = ""

    def is_available(self) -> bool:
        return bool(self.ctx.extras.get("active_mode"))

    def run(self) -> Tuple[Optional[object], List[Finding]]:
        client = HttpClient(
            self.ctx.target_url,
            timeout=int(self.ctx.extras.get("http_timeout", 10)),
            delay=float(self.ctx.extras.get("request_delay", 0.05)),
        )
        client.login(self.ctx.extras.get("auth") or {})
        endpoints = [u for u in dict.fromkeys(self.ctx.extras.get("endpoints") or []) if _looks_api_like(u)]
        findings: List[Finding] = []
        findings.extend(self._schema_and_inventory(client))
        findings.extend(self._unauthenticated_api_data(client, endpoints))
        findings.extend(self._bola_heuristics(client, endpoints))
        findings.extend(self._unsafe_methods(client, endpoints))
        findings.extend(self._anti_automation(client))
        findings.extend(self._auth_diff_checks(endpoints))
        self.log.info("active_api produced %d finding(s).", len(findings))
        return None, findings

    def _schema_and_inventory(self, client: HttpClient) -> Iterable[Finding]:
        for path in ("api-docs/", "api-docs/swagger.json", "swagger.json", "openapi.json"):
            res = client.get(path)
            if not res or res.status != 200:
                continue
            body = res.body.lower()
            if "swagger" in body or "openapi" in body or '"paths"' in body:
                yield self.make_finding(
                    type_="Public API Schema / Documentation",
                    severity="medium",
                    endpoint=res.url,
                    description="API documentation/schema is publicly reachable.",
                    owasp=label("API:9", "W:A05"),
                    confidence="high",
                    evidence=_short(res.body),
                    reproduction=[f"Send GET {res.url}", "Observe API schema or documentation content."],
                    impact="Attackers can enumerate operations, models, parameters, and hidden endpoints.",
                    remediation="Restrict API documentation in non-development environments.",
                    validated=True,
                )

    def _unauthenticated_api_data(self, client: HttpClient, endpoints: List[str]) -> Iterable[Finding]:
        tested = 0
        for url in endpoints:
            if tested >= int(self.ctx.extras.get("active_api_max_get_tests", 30)):
                break
            res = client.get(url)
            tested += 1
            parsed = res.json() if res else None
            if not res or res.status != 200 or parsed is None:
                continue
            sensitive_keys = json_contains_sensitive_keys(parsed)
            classification = _classify_api_response(res.url, parsed, sensitive_keys)
            if classification == "inventory":
                severity = "info"
                confidence = "medium"
                title = "Public API Inventory / Catalog Endpoint"
                owasp = label("API:9")
                impact = "Public inventory endpoints expand the discoverable attack surface."
                remediation = "Document intentionally public APIs and remove stale or hidden endpoints."
            elif classification == "admin":
                severity = "high"
                confidence = "high"
                title = "Unauthenticated Admin/Internal API Data Exposure"
                owasp = label("API:3", "API:1", "W:A01")
                impact = "Admin/internal endpoints can expose configuration, environment, or privileged metadata."
                remediation = "Require authorization and avoid exposing internal/admin APIs anonymously."
            elif sensitive_keys:
                severity = "high"
                confidence = "high"
                title = "Unauthenticated Sensitive API Data Exposure"
                owasp = label("API:3", "W:A01")
                impact = "Sensitive object properties can expose credentials, tokens, roles, emails or payment data."
                remediation = "Filter sensitive fields and enforce object/property authorization."
            else:
                severity = "low"
                confidence = "medium"
                title = "Unauthenticated API Data Exposure"
                owasp = label("API:9")
                impact = "Public structured APIs should be reviewed and documented as intended exposure."
                remediation = "Classify public APIs and remove accidental exposure."
            yield self.make_finding(
                type_=title,
                severity=severity,
                endpoint=res.url,
                description="An API endpoint returned structured data without authentication.",
                owasp=owasp,
                confidence=confidence,
                evidence=f"Keys: {', '.join(interesting_json_keys(parsed)[:20])}",
                reproduction=[f"Send GET {res.url} without credentials.", "Observe HTTP 200 with JSON data."],
                impact=impact,
                remediation=remediation,
                validated=True,
            )

    def _bola_heuristics(self, client: HttpClient, endpoints: List[str]) -> Iterable[Finding]:
        candidates = [u for u in endpoints if any(marker in u for marker in ("/1", "/2", "/3"))]
        seen = set()
        for url in candidates[: int(self.ctx.extras.get("active_api_max_bola_tests", 10))]:
            alt = _flip_numeric_id(url)
            if not alt or alt in seen:
                continue
            seen.add(alt)
            first = client.get(url)
            second = client.get(alt)
            if not first or not second:
                continue
            if first.status == 200 and second.status == 200 and _json_shape(first.body) == _json_shape(second.body):
                yield self.make_finding(
                    type_="BOLA/IDOR Numeric Object Probe",
                    severity="high",
                    endpoint=alt,
                    description="Changing a numeric object identifier returned a similarly shaped object.",
                    owasp=label("API:1", "W:A01"),
                    confidence="medium",
                    evidence=f"{url} and {alt} both returned HTTP 200 with similar JSON shape.",
                    reproduction=[f"Send GET {url}", f"Change the numeric ID and send GET {alt}"],
                    impact="Attackers may enumerate or access other users' objects by changing IDs.",
                    remediation="Authorize every object access against the current user/session.",
                    validated=True,
                )

    def _unsafe_methods(self, client: HttpClient, endpoints: List[str]) -> Iterable[Finding]:
        affected: List[str] = []
        allow_values: List[str] = []
        for url in endpoints[: int(self.ctx.extras.get("active_api_max_options_tests", 15))]:
            res = client.options(url)
            allow = (res.headers.get("Allow") or res.headers.get("Access-Control-Allow-Methods") or "") if res else ""
            if any(method in allow.upper() for method in ("PUT", "PATCH", "DELETE")):
                affected.append(url)
                if allow and allow not in allow_values:
                    allow_values.append(allow)
        if affected:
            examples = affected[:5]
            finding = self.make_finding(
                type_="Potentially Unsafe API Methods Advertised",
                severity="low",
                endpoint=examples[0],
                description=f"{len(affected)} endpoint(s) advertise state-changing HTTP methods.",
                owasp=label("API:5", "API:6"),
                confidence="medium",
                evidence=f"Allowed methods: {'; '.join(allow_values[:3])}; examples: {', '.join(examples)}",
                reproduction=[f"Send OPTIONS {example}" for example in examples],
                impact="Unsafe methods can become exploitable if authorization or CSRF controls are weak.",
                remediation="Expose only required methods and enforce authorization on state changes.",
                validated=True,
            )
            finding["affected_count"] = len(affected)
            finding["affected_examples"] = examples
            yield finding

    def _anti_automation(self, client: HttpClient) -> Iterable[Finding]:
        """Probe rate limiting against the **discovered** login path, never a hardcoded one."""

        path = self.ctx.extras.get("anti_automation_probe_path")
        if not path:
            auth = self.ctx.extras.get("auth") or {}
            path = auth.get("login_path") or self._guess_login_path_from_endpoints()
        if not path:
            return
        statuses: List[int] = []
        attempts = int(self.ctx.extras.get("anti_automation_probe_count", 8))
        for _ in range(attempts):
            res = client.post(
                str(path),
                json_body={
                    "username": "autoscan-anti-automation",
                    "email": "autoscan-anti-automation@example.invalid",
                    "password": "definitely-not-the-real-password",
                },
            )
            if res:
                statuses.append(res.status)
        if statuses and all(s != 429 for s in statuses) and any(s in {200, 400, 401, 403, 422} for s in statuses):
            yield self.make_finding(
                type_="Weak Anti-Automation Signal",
                severity="low",
                endpoint=client.resolve(str(path)),
                description=(
                    "Repeated invalid login attempts were accepted without HTTP 429 / lockout responses."
                ),
                owasp=label("API:4", "W:A07"),
                confidence="low",
                evidence=f"Statuses: {statuses}",
                reproduction=[f"Send {len(statuses)} repeated POSTs with bogus credentials to {client.resolve(str(path))}"],
                impact="Attackers may automate brute force, scraping, or resource consumption workflows.",
                remediation="Add rate limits, lockouts, and abuse detection to authentication endpoints.",
                validated=True,
            )

    def _guess_login_path_from_endpoints(self) -> Optional[str]:
        for raw in self.ctx.extras.get("endpoints") or []:
            path = urlparse(str(raw)).path.lower()
            if path.endswith("/login") or path.endswith("/signin") or path.endswith("/auth/login"):
                return path.lstrip("/")
        return None

    def _auth_diff_checks(self, endpoints: List[str]) -> Iterable[Finding]:
        auth = self.ctx.extras.get("auth") or {}
        if not auth.get("enabled"):
            self.ctx.extras["auth_diff_status"] = "skipped: auth.enabled is false"
            return
        anon = HttpClient(self.ctx.target_url, timeout=int(self.ctx.extras.get("http_timeout", 10)))
        authed = HttpClient(self.ctx.target_url, timeout=int(self.ctx.extras.get("http_timeout", 10)))
        ok, login_res = authed.login(auth)
        if not ok:
            self.ctx.extras["auth_diff_status"] = f"skipped: login failed ({login_res.status if login_res else 'no response'})"
            return
        self.ctx.extras["auth_diff_status"] = "completed"
        for url in endpoints[: int(self.ctx.extras.get("auth_diff_max_tests", 20))]:
            a = anon.get(url)
            b = authed.get(url)
            if not a or not b:
                continue
            if a.status == 200 and b.status == 200 and a.json() == b.json():
                continue
            if a.status in {401, 403} and b.status == 200:
                continue
            if a.status == 200 and b.status == 200:
                yield self.make_finding(
                    type_="Anonymous vs Authenticated API Difference",
                    severity="info",
                    endpoint=url,
                    description="Authenticated and anonymous responses differ; review authorization boundaries.",
                    owasp=label("API:1", "W:A01"),
                    confidence="low",
                    evidence=f"anonymous={a.status}, authenticated={b.status}",
                    reproduction=[f"Compare anonymous GET {url}", f"Compare authenticated GET {url}"],
                    impact="Differences can reveal endpoints that need more targeted authorization testing.",
                    remediation="Review whether anonymous and authenticated access is intended.",
                    validated=True,
                )


def _looks_api_like(url: str) -> bool:
    path = urlparse(url).path.lower()
    return "/api/" in path or "/rest/" in path or path.startswith("/api") or path.startswith("/rest")


def _classify_api_response(url: str, parsed: Any, sensitive_keys: List[str]) -> str:
    """Return admin | sensitive | inventory | generic based on path and JSON keys."""

    path = urlparse(url).path.lower()
    keys = set(interesting_json_keys(parsed))
    if any(part in path for part in ("/admin", "/configuration", "/config", "/settings", "/internal", "/management")):
        return "admin"
    if sensitive_keys:
        return "sensitive"
    public_path_terms = (
        "product",
        "catalog",
        "category",
        "version",
        "country",
        "currency",
        "language",
        "stock",
        "search",
    )
    public_key_terms = {
        "name",
        "title",
        "description",
        "price",
        "image",
        "category",
        "version",
        "stock",
        "currency",
        "status",
    }
    if any(term in path for term in public_path_terms) or keys.intersection(public_key_terms):
        return "inventory"
    return "generic"


def _flip_numeric_id(url: str) -> Optional[str]:
    parsed = urlparse(url)
    parts = parsed.path.rstrip("/").split("/")
    for idx in range(len(parts) - 1, -1, -1):
        if parts[idx].isdigit():
            parts[idx] = str(int(parts[idx]) + 1)
            return parsed._replace(path="/".join(parts)).geturl()
    return None


def _json_shape(text: str) -> Any:
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(value, dict):
        return sorted(value.keys())
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return sorted(value[0].keys())
    return type(value).__name__


def _short(text: str, limit: int = 300) -> str:
    return " ".join((text or "").split())[:limit]
