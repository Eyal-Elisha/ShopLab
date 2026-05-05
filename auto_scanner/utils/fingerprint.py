"""Passive fingerprinting that feeds discovery candidate paths.

The fingerprinter never executes attacks: it only sends a few benign
GETs to the root, ``/api``, ``/api/health``, ``/robots.txt``,
``/sitemap.xml`` and a handful of common SPA/script bundles. The
output is a :class:`Fingerprint` dataclass plus a small list of
**derived candidate paths** that should be attempted before any heavier
scanner runs.

The output is deliberately generic; we never hard-code product names.
For example, "if a `connect.sid` cookie is observed, suggest
`/auth/login` and `/auth/logout`" — this is a property of an HTTP
session middleware, not of any specific application.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, List, Optional, Set, Tuple
from urllib.parse import urljoin

from utils.http_client import HttpClient, paths_from_openapi


SPA_MARKERS: Tuple[str, ...] = (
    "<app-root",
    "<div id=\"root\">",
    "<div id='root'>",
    "main.js",
    "polyfills.js",
    "data-beasties-container",
    "vite",
    "nuxt",
    "next-route",
)

# Cookie names → likely framework + a couple of generic auth paths to seed.
SESSION_COOKIE_HINTS: Tuple[Tuple[str, str, Tuple[str, ...]], ...] = (
    ("connect.sid", "express-session", ("/auth/login", "/auth/logout", "/login", "/logout")),
    ("session", "generic-session", ("/login", "/logout")),
    ("PHPSESSID", "php", ("/login.php", "/logout.php")),
    ("JSESSIONID", "java-servlet", ("/login", "/j_security_check")),
    ("ASP.NET_SessionId", "asp.net", ("/Account/Login", "/Account/Logout")),
    ("laravel_session", "laravel", ("/login", "/logout")),
    ("django_session", "django", ("/admin/login/", "/accounts/login/")),
    ("XSRF-TOKEN", "csrf-token-cookie", ("/api/csrf",)),
    ("sails.sid", "sails.js", ("/login", "/logout")),
)

HEADER_FRAMEWORK_HINTS: Tuple[Tuple[str, str], ...] = (
    ("server", "nginx"),
    ("server", "apache"),
    ("server", "iis"),
    ("server", "express"),
    ("server", "kestrel"),
    ("server", "gunicorn"),
    ("server", "uvicorn"),
    ("x-powered-by", "express"),
    ("x-powered-by", "asp.net"),
    ("x-powered-by", "php"),
    ("x-powered-by", "next.js"),
    ("x-aspnet-version", "asp.net"),
    ("x-rails", "rails"),
)


@dataclass
class Fingerprint:
    """Lightweight passive fingerprint of a target."""

    target: str
    spa: bool = False
    framework_hints: List[str] = field(default_factory=list)
    cookie_hints: List[str] = field(default_factory=list)
    api_style: List[str] = field(default_factory=list)
    auth_style: List[str] = field(default_factory=list)
    candidate_paths: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def merge_candidates(self, paths: Iterable[str]) -> None:
        seen = set(self.candidate_paths)
        for raw in paths:
            cleaned = (raw or "").strip()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                self.candidate_paths.append(cleaned)


def fingerprint_target(client: HttpClient, target_url: str) -> Fingerprint:
    """Probe ``target_url`` for passive technology signals.

    A best-effort, side-effect-free pass: we never POST, never auth,
    never call destructive methods. Failures degrade silently.
    """

    fp = Fingerprint(target=target_url.rstrip("/"))

    home = client.get("/")
    if home and home.status:
        _read_headers(fp, home.lower_headers)
        _read_body_markers(fp, home.body)
        _read_cookies(fp, home.headers)

    api_root = client.get("api")
    if api_root and api_root.status == 200 and _looks_json(api_root):
        fp.api_style.append("rest-json-index")
        try:
            parsed = json.loads(api_root.body)
        except (ValueError, json.JSONDecodeError):
            parsed = None
        if isinstance(parsed, dict):
            if any(k in parsed for k in ("endpoints", "routes", "paths")):
                fp.notes.append("public route catalog at /api")

    health = client.get("api/health") or client.get("health")
    if health and health.status == 200 and _looks_json(health):
        fp.api_style.append("health-endpoint")

    for path in ("api-docs/swagger.json", "swagger.json", "openapi.json", "api-docs/"):
        res = client.get(path)
        if not res or res.status >= 500:
            continue
        try:
            doc = json.loads(res.body)
        except (ValueError, json.JSONDecodeError):
            continue
        derived = paths_from_openapi(doc, target_url.rstrip("/") + "/")
        if derived:
            fp.api_style.append("openapi")
            fp.merge_candidates(derived)
            break

    robots = client.get("robots.txt")
    if robots and robots.status == 200 and "disallow" in robots.body.lower():
        fp.merge_candidates(_robots_paths(robots.body, target_url))

    sitemap = client.get("sitemap.xml")
    if sitemap and sitemap.status == 200 and "<url>" in sitemap.body.lower():
        fp.merge_candidates(_sitemap_paths(sitemap.body, target_url))

    fp.framework_hints = _dedupe(fp.framework_hints)
    fp.cookie_hints = _dedupe(fp.cookie_hints)
    fp.api_style = _dedupe(fp.api_style)
    fp.auth_style = _dedupe(fp.auth_style)
    return fp


def _read_headers(fp: Fingerprint, lower_headers: dict) -> None:
    for header, needle in HEADER_FRAMEWORK_HINTS:
        value = (lower_headers.get(header) or "").lower()
        if needle in value:
            fp.framework_hints.append(needle)
    if "graphql" in (lower_headers.get("content-type") or "").lower():
        fp.api_style.append("graphql")
    if "application/hal+json" in (lower_headers.get("content-type") or "").lower():
        fp.api_style.append("hal+json")


def _read_body_markers(fp: Fingerprint, body: str) -> None:
    if not body:
        return
    head = body[:4000].lower()
    if any(marker in head for marker in SPA_MARKERS):
        fp.spa = True
    if "graphql" in head and "query" in head:
        fp.api_style.append("graphql")


def _read_cookies(fp: Fingerprint, headers: dict) -> None:
    raw_cookies: List[str] = []
    for key, value in headers.items():
        if key.lower() == "set-cookie":
            raw_cookies.append(value)
    if not raw_cookies:
        return
    blob = "; ".join(raw_cookies).lower()
    for cookie_name, framework, paths in SESSION_COOKIE_HINTS:
        if cookie_name.lower() in blob:
            fp.cookie_hints.append(cookie_name)
            fp.framework_hints.append(framework)
            fp.auth_style.append(framework)
            fp.merge_candidates(paths)
    if "jwt" in blob or "bearer" in blob:
        fp.auth_style.append("jwt-cookie")


def _robots_paths(body: str, base_url: str) -> List[str]:
    out: List[str] = []
    for line in body.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        directive, _, value = line.partition(":")
        if directive.strip().lower() not in {"allow", "disallow"}:
            continue
        target = value.strip()
        if not target or target == "*":
            continue
        out.append(urljoin(base_url.rstrip("/") + "/", target.lstrip("/")))
    return out


_LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)


def _sitemap_paths(body: str, base_url: str) -> List[str]:
    out: List[str] = []
    for match in _LOC_RE.findall(body or ""):
        out.append(match)
    return out


def _looks_json(response: Any) -> bool:
    """Best-effort JSON sniff that works against any response-like object."""

    headers = getattr(response, "lower_headers", None)
    if not isinstance(headers, dict):
        raw = getattr(response, "headers", {}) or {}
        headers = {str(k).lower(): str(v) for k, v in raw.items()}
    ctype = (headers.get("content-type") or "").lower()
    if "json" in ctype:
        return True
    body = getattr(response, "body", "") or ""
    head = body.lstrip()[:1]
    if head not in ("{", "["):
        return False
    try:
        json.loads(body)
        return True
    except (ValueError, json.JSONDecodeError):
        return False


def _dedupe(seq: Iterable[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for item in seq:
        token = (item or "").strip()
        if not token or token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


__all__ = [
    "Fingerprint",
    "HEADER_FRAMEWORK_HINTS",
    "SESSION_COOKIE_HINTS",
    "SPA_MARKERS",
    "fingerprint_target",
]
