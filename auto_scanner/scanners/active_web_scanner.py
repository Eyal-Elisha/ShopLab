"""Active web probes: SQL/XSS/redirect on crawled URLs, sensitive static files, access control."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from utils.http_client import HttpClient, is_spa_fallback, sensitive_file_signature
from utils.owasp_taxonomy import label

from .base import BaseScanner, Finding


SQL_ERRORS = re.compile(
    r"(SQLITE_ERROR|SQL syntax|MySQL|PostgreSQL|ORA-\d+|ODBC|JDBC|SequelizeDatabaseError|database error|near \".+\": syntax error)",
    re.I,
)
GENERIC_ERROR = re.compile(r"(unexpected path|blocked illegal activity|internal server error|stack trace|traceback)", re.I)
XSS_TOKEN = "autoScannerXssProbe"


GENERIC_SENSITIVE_FILE_PATHS: Tuple[str, ...] = (
    ".env",
    ".env.local",
    ".env.development",
    ".git/config",
    ".gitignore",
    ".DS_Store",
    "backup.zip",
    "backup.tar",
    "backup.tar.gz",
    "package.json.bak",
    "package-lock.json.bak",
    "config.json.bak",
    "settings.py.bak",
    "web.config.bak",
)


class ActiveWebScanner(BaseScanner):
    name = "active_web"
    binary = ""

    def is_available(self) -> bool:
        return bool(self.ctx.extras.get("active_mode"))

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        client = HttpClient(
            self.ctx.target_url,
            timeout=int(self.ctx.extras.get("http_timeout", 10)),
            delay=float(self.ctx.extras.get("request_delay", 0.05)),
        )
        auth_ok, auth_res = client.login(self.ctx.extras.get("auth") or {})
        if auth_res:
            self.log.info("Configured login attempted: %s", "success" if auth_ok else "failed")

        endpoints = list(dict.fromkeys(self.ctx.extras.get("endpoints") or [self.ctx.target_url]))
        baseline = client.get("/")
        findings: List[Finding] = []
        findings.extend(self._injection_checks(client, endpoints))
        findings.extend(self._xss_reflection_checks(client, endpoints))
        findings.extend(self._redirect_checks(client, endpoints))
        findings.extend(self._access_control_checks(client, endpoints, baseline))
        findings.extend(self._sensitive_file_checks(client, baseline))
        self.log.info("active_web produced %d finding(s).", len(findings))
        return None, findings

    def _injection_checks(self, client: HttpClient, endpoints: List[str]) -> Iterable[Finding]:
        targets = [u for u in endpoints if urlparse(u).query]
        for url in targets[: int(self.ctx.extras.get("active_web_max_param_tests", 20))]:
            probe = _replace_first_query_value(url, "'")
            res = client.get(probe)
            if not res:
                continue
            if SQL_ERRORS.search(res.body):
                yield self.make_finding(
                    type_="SQL Error Disclosure / Injection Indicator",
                    severity="high",
                    endpoint=probe,
                    description="A quote payload caused a SQL-like error or server error.",
                    owasp=label("W:A03", "API:8"),
                    confidence="high",
                    evidence=_snippet(res.body, SQL_ERRORS),
                    reproduction=[f"Send GET {probe}", "Observe SQL-like error text or HTTP 5xx response."],
                    impact="Attackers may be able to manipulate backend queries or learn database internals.",
                    remediation="Use parameterized queries and return generic errors.",
                    validated=True,
                )
            elif res.status >= 500 or GENERIC_ERROR.search(res.body):
                yield self.make_finding(
                    type_="Verbose Error Handling / Active Probe",
                    severity="medium",
                    endpoint=probe,
                    description="A malformed parameter caused a verbose or inconsistent error page.",
                    owasp=label("W:A05", "API:8"),
                    confidence="medium",
                    evidence=_snippet(res.body, GENERIC_ERROR),
                    reproduction=[f"Send GET {probe}", "Observe verbose error output or inconsistent handling."],
                    impact="Verbose errors can reveal routing, framework, or defensive-control behavior.",
                    remediation="Return generic errors and log detailed diagnostics server-side only.",
                    validated=True,
                )

    def _xss_reflection_checks(self, client: HttpClient, endpoints: List[str]) -> Iterable[Finding]:
        payload = f"<{XSS_TOKEN}>"
        for url in [u for u in endpoints if urlparse(u).query][: int(self.ctx.extras.get("active_web_max_param_tests", 20))]:
            probe = _replace_first_query_value(url, payload)
            res = client.get(probe)
            if res and payload in res.body:
                yield self.make_finding(
                    type_="Reflected XSS Indicator",
                    severity="high",
                    endpoint=probe,
                    description="A marker payload was reflected into the HTTP response.",
                    owasp=label("W:A03"),
                    confidence="medium",
                    evidence=payload,
                    reproduction=[f"Send GET {probe}", "Search the response body for the marker payload."],
                    impact="Reflected input may become executable script if output encoding is missing.",
                    remediation="Contextually encode reflected data and validate input.",
                    validated=True,
                )

    def _redirect_checks(self, client: HttpClient, endpoints: List[str]) -> Iterable[Finding]:
        param_names = self.ctx.extras.get("open_redirect_param_names") or [
            "url",
            "next",
            "redirect",
            "redirect_uri",
            "to",
            "return",
            "returnTo",
            "returnUrl",
            "destination",
        ]
        param_set = {p.lower() for p in param_names}
        seen: set = set()
        for url in endpoints[: int(self.ctx.extras.get("active_web_max_param_tests", 20))]:
            parsed = urlparse(url)
            if not parsed.query:
                continue
            pairs = parse_qsl(parsed.query, keep_blank_values=True)
            for idx, (name, _value) in enumerate(pairs):
                if name.lower() not in param_set:
                    continue
                key = (parsed.path, name)
                if key in seen:
                    continue
                seen.add(key)
                attack = list(pairs)
                attack[idx] = (name, "https://probe.invalid/")
                probe_url = urlunparse(
                    (parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(attack), parsed.fragment)
                )
                res = client.get(probe_url, follow_redirects=False)
                if not res or not res.location:
                    continue
                if "probe.invalid" in res.location.lower():
                    yield self.make_finding(
                        type_="Open Redirect",
                        severity="medium",
                        endpoint=res.url,
                        description="The endpoint emitted a Location header pointing at attacker-supplied input.",
                        owasp=label("W:A01", "API:7"),
                        confidence="high",
                        evidence=f"Location: {res.location}",
                        reproduction=[f"Send GET {res.url}", f"Observe Location header: {res.location}"],
                        impact="Can support phishing, token leakage, or redirect-based allowlist bypasses.",
                        remediation="Use a strict server-side allowlist of relative or trusted redirect targets.",
                        validated=True,
                    )

    def _access_control_checks(self, client: HttpClient, endpoints: List[str], baseline) -> Iterable[Finding]:
        candidate_paths = list(self.ctx.extras.get("access_control_paths") or [])
        if not candidate_paths:
            candidate_paths = list(_discovery_admin_candidates(endpoints, self.ctx.target_url))
        seen: set = set()
        for path in candidate_paths[:24]:
            normalized = str(path).lstrip("/")
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            res = client.get(normalized)
            if res and res.status == 200 and len(res.body) > 10 and not is_spa_fallback(res, baseline):
                yield self.make_finding(
                    type_="Unauthenticated Sensitive Endpoint",
                    severity="medium",
                    endpoint=res.url,
                    description="A potentially sensitive endpoint returned data without authentication.",
                    owasp=label("W:A01", "API:1"),
                    confidence="medium",
                    evidence=_short(res.body),
                    reproduction=[f"Open {res.url} in an unauthenticated session."],
                    impact="Anonymous users may access functions or data intended for privileged users.",
                    remediation="Require authorization checks on every sensitive route/API handler.",
                    validated=True,
                )

    def _sensitive_file_checks(self, client: HttpClient, baseline) -> Iterable[Finding]:
        for path in self.ctx.extras.get("sensitive_file_paths") or GENERIC_SENSITIVE_FILE_PATHS:
            res = client.get(str(path))
            signature = sensitive_file_signature(str(path), res, baseline)
            if signature:
                yield self.make_finding(
                    type_="Exposed Sensitive File",
                    severity="high" if ".env" in str(path) or ".git" in str(path) else "medium",
                    endpoint=res.url,
                    description="A backup/configuration/source artifact is publicly reachable.",
                    owasp=label("W:A05", "API:3"),
                    confidence="high",
                    evidence=f"{signature}: {_short(res.body)}",
                    reproduction=[f"Send GET {res.url}", "Observe the file contents in the response body."],
                    impact="Exposed files can leak secrets, dependencies, routes, or implementation details.",
                    remediation="Remove sensitive files from the web root and block backup/source artifacts.",
                    validated=True,
                )


_PRIVILEGED_PATH_NEEDLES = ("/admin", "/internal", "/debug", "/staff", "/management", "/dashboard")


def _discovery_admin_candidates(endpoints: List[str], target_url: str) -> List[str]:
    base = target_url.rstrip("/") + "/"
    out: List[str] = []
    seen: set = set()
    for url in endpoints:
        parsed = urlparse(url)
        path = parsed.path.lower()
        if not any(needle in path for needle in _PRIVILEGED_PATH_NEEDLES):
            continue
        if parsed.scheme and parsed.netloc and urlparse(base).netloc not in parsed.netloc:
            continue
        cleaned = parsed.path.lstrip("/")
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            out.append(cleaned)
    return out


def _replace_first_query_value(url: str, value: str) -> str:
    parsed = urlparse(url)
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    if not pairs:
        return url
    pairs[0] = (pairs[0][0], value)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(pairs), parsed.fragment))


def _snippet(text: str, pattern: re.Pattern[str]) -> str:
    match = pattern.search(text or "")
    if not match:
        return _short(text)
    start = max(0, match.start() - 80)
    end = min(len(text), match.end() + 160)
    return " ".join(text[start:end].split())


def _short(text: str, limit: int = 300) -> str:
    return " ".join((text or "").split())[:limit]
