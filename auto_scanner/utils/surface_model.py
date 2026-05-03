"""Generic attack-surface model built from discovery output.

The model deliberately stores observations, not app-specific knowledge.  It is
fed by discovered URLs, passive fingerprints, and finding text, then persisted
so later phases can decide which validation tools are justified.
"""

from __future__ import annotations

import ipaddress
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from urllib.parse import parse_qs, urlparse


_API_MARKERS = ("/api", "/rest", "/graphql", "/v1", "/v2")
_AUTH_MARKERS = ("login", "register", "signin", "signup", "auth", "session", "token")
_WORDPRESS_MARKERS = ("wp-content", "wp-json", "wp-admin", "wordpress")
_LLM_MARKERS = ("/chat", "/assistant", "/completion", "/completions", "/messages", "/support")


@dataclass
class EndpointSurface:
    url: str
    path: str
    has_query: bool = False
    query_params: List[str] = field(default_factory=list)
    is_api: bool = False
    looks_auth_related: bool = False


@dataclass
class SurfaceModel:
    target: str
    root: str
    scheme: str
    host: str
    port: Optional[int]
    is_https: bool
    is_private_or_local: bool
    endpoints: List[EndpointSurface] = field(default_factory=list)
    technologies: List[str] = field(default_factory=list)
    auth_hints: List[str] = field(default_factory=list)
    api_endpoints: List[str] = field(default_factory=list)
    query_urls: List[str] = field(default_factory=list)
    wordpress_detected: bool = False
    candidate_attacks: List[str] = field(default_factory=list)
    discovery_counts: Dict[str, int] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    def write(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")
        return path


def build_surface_model(target_url: str, endpoints: Iterable[str], findings: Iterable[dict], extras: dict) -> SurfaceModel:
    parsed_target = urlparse(target_url)
    root = f"{parsed_target.scheme}://{parsed_target.netloc}"
    host = parsed_target.hostname or ""
    model = SurfaceModel(
        target=target_url,
        root=root,
        scheme=parsed_target.scheme or "http",
        host=host,
        port=parsed_target.port,
        is_https=(parsed_target.scheme == "https"),
        is_private_or_local=_is_private_or_local(host),
    )

    fp = extras.get("fingerprint") if isinstance(extras.get("fingerprint"), dict) else {}
    model.technologies = _dedupe(str(x) for x in fp.get("framework_hints", []) if x)
    model.auth_hints = _dedupe(str(x) for x in fp.get("auth_style", []) if x)
    model.notes = _dedupe(str(x) for x in fp.get("notes", []) if x)

    urls = _dedupe(str(u).strip() for u in endpoints if str(u).strip())
    for url in urls:
        ep = _endpoint_surface(url, root)
        model.endpoints.append(ep)
        if ep.is_api:
            model.api_endpoints.append(ep.url)
        if ep.has_query:
            model.query_urls.append(ep.url)
        if ep.looks_auth_related:
            model.auth_hints.append(ep.path)

    finding_list = list(findings)
    model.discovery_counts = _counts_by_tool(finding_list)
    model.wordpress_detected = _wordpress_detected(model, finding_list)
    model.auth_hints = _dedupe(model.auth_hints)
    model.candidate_attacks = _candidate_attacks(model, finding_list)
    return model


def _endpoint_surface(url: str, root: str) -> EndpointSurface:
    parsed = urlparse(url)
    path = parsed.path or "/"
    lower = f"{path}?{parsed.query}".lower()
    query_params = sorted(parse_qs(parsed.query, keep_blank_values=True).keys())
    return EndpointSurface(
        url=url if parsed.scheme else root.rstrip("/") + "/" + url.lstrip("/"),
        path=path,
        has_query=bool(parsed.query),
        query_params=query_params,
        is_api=any(marker in lower for marker in _API_MARKERS),
        looks_auth_related=any(marker in lower for marker in _AUTH_MARKERS),
    )


def _candidate_attacks(model: SurfaceModel, findings: List[dict]) -> List[str]:
    out: List[str] = []
    if model.query_urls:
        out.append("sqlmap")
    if model.is_https:
        out.append("ssl")
    if model.api_endpoints:
        out.extend(["active_api", "authenticated_probes"])
    if any(_text(f).find("graphql") >= 0 for f in findings) or any("/graphql" in e.path.lower() for e in model.endpoints):
        out.append("graphql")
    if any(marker in e.path.lower() for marker in _LLM_MARKERS for e in model.endpoints):
        out.append("llm")
    out.extend(["zap", "nikto"])
    return _dedupe(out)


def _wordpress_detected(model: SurfaceModel, findings: List[dict]) -> bool:
    haystack = " ".join(
        [
            model.target,
            " ".join(e.url for e in model.endpoints[:500]),
            " ".join(model.technologies),
            " ".join(_text(f) for f in findings[:500]),
        ]
    ).lower()
    return any(marker in haystack for marker in _WORDPRESS_MARKERS)


def _counts_by_tool(findings: Iterable[dict]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for f in findings:
        tool = str(f.get("tool") or "unknown")
        out[tool] = out.get(tool, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: (-kv[1], kv[0])))


def _is_private_or_local(host: str) -> bool:
    if not host:
        return True
    lowered = host.lower()
    if lowered in {"localhost", "host.docker.internal"} or lowered.endswith(".local"):
        return True
    try:
        ip = ipaddress.ip_address(lowered)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


def _text(finding: dict) -> str:
    return " ".join(str(finding.get(k) or "") for k in ("type", "description", "endpoint", "evidence")).lower()


def _dedupe(values: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for value in values:
        cleaned = re.sub(r"\s+", " ", str(value).strip())
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        out.append(cleaned)
    return out
