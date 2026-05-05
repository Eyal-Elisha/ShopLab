"""HTTP passive-check suite (reachability, headers, cookies, CSP, CORS, redirect,
route catalog, JWT audit, info disclosure, GraphQL introspection).

All probe logic lives here. External code imports from ``scanners.http_checks``
directly; there are no sub-modules.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

from ..base import BaseScanner, Finding
from utils.http_client import route_catalog_suggests_privileged_paths
from utils.jwt_tools import decode_jwt, extract_jwts, jwt_risks, summarize_claims
from utils.owasp_taxonomy import label

# ---------------------------------------------------------------------------
# HTTP primitives
# ---------------------------------------------------------------------------

@dataclass
class HttpResponse:
    url: str
    status: int
    headers: Dict[str, str]
    body: str
    location: Optional[str] = None

    @property
    def lower_headers(self) -> Dict[str, str]:
        return {k.lower(): v for k, v in self.headers.items()}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


def request(
    url: str,
    *,
    method: str = "GET",
    follow_redirects: bool = True,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 10,
    user_agent: str = "auto_scanner-http_checks/1.0",
    max_bytes: int = 256_000,
) -> Tuple[Optional[HttpResponse], Optional[str]]:
    """Send a single stateless HTTP request. Returns ``(response, error)``."""
    opener = build_opener(_NoRedirect) if not follow_redirects else None
    req_headers = {"User-Agent": user_agent, "Accept": "*/*"}
    if headers:
        req_headers.update(headers)
    req = Request(url, headers=req_headers, method=method.upper())
    try:
        handle = opener.open(req, timeout=timeout) if opener else urlopen(req, timeout=timeout)
        with handle:
            raw = handle.read(max_bytes)
            return (
                HttpResponse(
                    url=url,
                    status=int(handle.getcode() or 0),
                    headers=dict(handle.headers.items()),
                    body=raw.decode("utf-8", "replace"),
                    location=handle.headers.get("Location"),
                ),
                None,
            )
    except HTTPError as exc:
        raw = exc.read(max_bytes)
        return (
            HttpResponse(
                url=url,
                status=int(exc.code),
                headers=dict(exc.headers.items()),
                body=raw.decode("utf-8", "replace"),
                location=exc.headers.get("Location"),
            ),
            None,
        )
    except (TimeoutError, URLError, OSError) as exc:
        return None, f"{type(exc).__name__}: {exc}"


def get(url: str, **kwargs) -> Optional[HttpResponse]:
    res, _err = request(url, method="GET", **kwargs)
    return res


def looks_unreachable(message: str) -> bool:
    text = (message or "").lower()
    needles = (
        "connection refused",
        "[errno 111]",
        "errno 113",
        "network is unreachable",
        "timed out",
        "name or service not known",
        "temporary failure",
    )
    return any(n in text for n in needles)


# ---------------------------------------------------------------------------
# Probe: security headers
# ---------------------------------------------------------------------------

def _header_findings(response: HttpResponse, mk_finding: Callable[..., dict]) -> List[dict]:
    findings: List[dict] = []
    headers = response.lower_headers
    checks = [
        ("content-security-policy", "Content Security Policy Header Missing", "medium"),
        ("x-frame-options", "Clickjacking Protection Header Missing", "medium"),
        ("x-content-type-options", "MIME Sniffing Protection Header Missing", "low"),
        ("referrer-policy", "Referrer Policy Header Missing", "low"),
        ("strict-transport-security", "HSTS Header Missing (HTTP responses)", "low"),
    ]
    owasp = label("W:A05", "API:8")
    for header, title, severity in checks:
        if header not in headers:
            findings.append(
                mk_finding(
                    type_=title,
                    severity=severity,
                    endpoint=response.url,
                    description=f"The HTTP response does not include the {header} header.",
                    owasp=owasp,
                    confidence="high",
                    evidence=f"Headers seen: {', '.join(sorted(headers.keys())[:15])}",
                    impact="Browsers cannot apply the corresponding mitigation if the header is absent.",
                    remediation="Configure the missing header at the reverse proxy or web framework layer.",
                    validated=True,
                )
            )
    server_value = headers.get("server", "")
    if server_value and any(part in server_value.lower() for part in ("/", " ")):
        findings.append(
            mk_finding(
                type_="Server Banner Discloses Software/Version",
                severity="info",
                endpoint=response.url,
                description="The server emits a verbose Server header that includes software and version.",
                owasp=owasp,
                confidence="medium",
                evidence=f"Server: {server_value}",
                impact="Attackers can match disclosed software/version to known CVEs.",
                remediation="Set ``server_tokens off`` (nginx) / ``ServerTokens Prod`` (Apache) / equivalent.",
                validated=True,
            )
        )
    return findings


# ---------------------------------------------------------------------------
# Probe: cookies
# ---------------------------------------------------------------------------

_NAME_RE = re.compile(r"^([^=;]+)=", re.I)


def cookie_findings(response: HttpResponse, mk_finding: Callable[..., dict]) -> List[dict]:
    findings: List[dict] = []
    cookie_headers: List[str] = []
    for key, value in response.headers.items():
        if key.lower() == "set-cookie":
            cookie_headers.append(value)
    if not cookie_headers:
        return findings
    secure_target = response.url.lower().startswith("https://")
    for raw in cookie_headers:
        attrs = {part.strip().lower() for part in raw.split(";") if part.strip()}
        name_match = _NAME_RE.match(raw)
        cookie_name = name_match.group(1).strip() if name_match else "<unnamed>"
        problems: List[str] = []
        if secure_target and not any(a == "secure" or a.startswith("secure ") for a in attrs):
            problems.append("missing Secure flag")
        if not any(a == "httponly" or a.startswith("httponly ") for a in attrs):
            problems.append("missing HttpOnly flag")
        if not any(a.startswith("samesite=") for a in attrs):
            problems.append("missing SameSite attribute")
        if problems:
            findings.append(
                mk_finding(
                    type_="Cookie Lacks Recommended Attributes",
                    severity="medium",
                    endpoint=response.url,
                    description=(
                        f"Cookie `{cookie_name}` is missing recommended security attributes: "
                        + ", ".join(problems)
                        + "."
                    ),
                    owasp=label("W:A05", "W:A07"),
                    confidence="high",
                    evidence=raw[:300],
                    impact="Cookies without protection attributes are easier to leak via XSS or transport downgrade.",
                    remediation="Set ``Secure; HttpOnly; SameSite=Lax`` (or ``Strict``) for all session cookies.",
                    validated=True,
                )
            )
    return findings


# ---------------------------------------------------------------------------
# Probe: CSP quality
# ---------------------------------------------------------------------------

def csp_findings(response: HttpResponse, mk_finding: Callable[..., dict]) -> List[dict]:
    findings: List[dict] = []
    csp = response.lower_headers.get("content-security-policy") or response.lower_headers.get(
        "content-security-policy-report-only"
    )
    if not csp:
        return findings
    directives = _parse_csp(csp)
    issues: List[str] = []
    for risky in ("unsafe-inline", "unsafe-eval", "data:", "*"):
        for name, sources in directives.items():
            if risky in sources:
                issues.append(f"{name} contains '{risky}'")
    for required in ("default-src", "script-src", "object-src"):
        if required not in directives:
            issues.append(f"{required} not declared")
    if issues:
        findings.append(
            mk_finding(
                type_="Weak Content Security Policy",
                severity="medium",
                endpoint=response.url,
                description="CSP allows broadly permissive sources or omits critical directives.",
                owasp=label("W:A05"),
                confidence="high",
                evidence="; ".join(issues[:8]),
                impact="A weak CSP cannot block injected/evaluated scripts in modern browsers.",
                remediation="Restrict default-src/script-src to specific origins; remove ``unsafe-inline`` and ``unsafe-eval``; declare ``object-src 'none'``.",
                validated=True,
            )
        )
    return findings


def _parse_csp(raw: str) -> Dict[str, List[str]]:
    parsed: Dict[str, List[str]] = {}
    for chunk in raw.split(";"):
        text = chunk.strip()
        if not text:
            continue
        parts = text.split()
        directive = parts[0].lower()
        sources = [p.strip().strip("'") for p in parts[1:]]
        parsed[directive] = sources
    return parsed


# ---------------------------------------------------------------------------
# Probe: CORS reflection
# ---------------------------------------------------------------------------

def _cors_findings(target_root: str, probe_origin: str, mk_finding: Callable[..., dict]) -> List[dict]:
    findings: List[dict] = []
    candidates = [urljoin(target_root, "api"), urljoin(target_root, "api/"), target_root]
    for url in candidates:
        res = get(url, headers={"Origin": probe_origin})
        if not res:
            continue
        allow_origin = res.lower_headers.get("access-control-allow-origin", "")
        allow_creds = res.lower_headers.get("access-control-allow-credentials", "").lower()
        if not allow_origin:
            continue
        reflected = allow_origin.strip() == probe_origin
        wildcard = allow_origin.strip() == "*"
        if reflected and allow_creds == "true":
            findings.append(
                mk_finding(
                    type_="CORS Reflection With Credentials",
                    severity="high",
                    endpoint=res.url,
                    description=(
                        "The server reflected an arbitrary Origin and set "
                        "``Access-Control-Allow-Credentials: true``."
                    ),
                    owasp=label("W:A05", "API:8"),
                    confidence="high",
                    evidence=f"Origin: {probe_origin} → Allow-Origin: {allow_origin}; Allow-Credentials: {allow_creds}",
                    impact="Attacker pages can issue authenticated cross-origin requests on behalf of the user.",
                    remediation="Allowlist trusted origins server-side; never combine credentials with reflected origins.",
                    validated=True,
                )
            )
            return findings
        if wildcard and allow_creds == "true":
            findings.append(
                mk_finding(
                    type_="CORS Wildcard With Credentials",
                    severity="high",
                    endpoint=res.url,
                    description="``Access-Control-Allow-Origin: *`` combined with ``Allow-Credentials: true``.",
                    owasp=label("W:A05", "API:8"),
                    confidence="high",
                    evidence=f"Allow-Origin: {allow_origin}; Allow-Credentials: {allow_creds}",
                    impact="Browsers will reject this combination, but it indicates a misconfigured CORS policy.",
                    remediation="Either drop credentials or scope Allow-Origin to specific trusted hosts.",
                    validated=True,
                )
            )
            return findings
        if reflected:
            findings.append(
                mk_finding(
                    type_="CORS Reflects Arbitrary Origin",
                    severity="low",
                    endpoint=res.url,
                    description="The server reflected an arbitrary Origin header in the response.",
                    owasp=label("W:A05", "API:8"),
                    confidence="medium",
                    evidence=f"Origin: {probe_origin} → Allow-Origin: {allow_origin}",
                    impact="Reflective CORS policies become exploitable when credentials are added to the response.",
                    remediation="Replace dynamic Allow-Origin with a server-side allowlist of trusted origins.",
                    validated=True,
                )
            )
            return findings
    return findings


# ---------------------------------------------------------------------------
# Probe: open redirect
# ---------------------------------------------------------------------------

_PROBE_HOST = "https://probe.invalid/"
_REDIRECT_PARAMS = ("url", "next", "redirect", "redirect_uri", "to", "return", "returnTo", "returnUrl", "destination")


def redirect_findings(
    endpoints: Iterable[str],
    param_names: Sequence[str],
    mk_finding: Callable[..., dict],
    *,
    cap: int = 12,
) -> List[dict]:
    findings: List[dict] = []
    name_set = {p.lower() for p in param_names}
    seen: set = set()
    tested = 0
    for url in endpoints:
        if tested >= cap:
            break
        parsed = urlparse(url)
        if not parsed.query:
            continue
        pairs = parse_qsl(parsed.query, keep_blank_values=True)
        for idx, (name, _value) in enumerate(pairs):
            if name.lower() not in name_set:
                continue
            key = (parsed.path, name)
            if key in seen:
                continue
            seen.add(key)
            attack = list(pairs)
            attack[idx] = (name, _PROBE_HOST)
            probe_url = urlunparse(
                (parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(attack), parsed.fragment)
            )
            res = get(probe_url, follow_redirects=False)
            tested += 1
            if not res or not res.location:
                continue
            if "probe.invalid" in res.location.lower():
                findings.append(
                    mk_finding(
                        type_="Open Redirect",
                        severity="medium",
                        endpoint=res.url,
                        description=(
                            "The endpoint emitted a Location header pointing at attacker-supplied "
                            f"input (parameter ``{name}``)."
                        ),
                        owasp=label("W:A01", "API:7"),
                        confidence="high",
                        evidence=f"Location: {res.location}",
                        reproduction=[f"Send GET {res.url}", f"Observe Location: {res.location}"],
                        impact="Can support phishing, OAuth token theft, or allowlist bypass.",
                        remediation="Use a server-side allowlist of relative or trusted redirect targets.",
                        validated=True,
                    )
                )
    return findings


# ---------------------------------------------------------------------------
# Probe: JWT audit
# ---------------------------------------------------------------------------

def _jwt_audit_findings(
    responses: Iterable[HttpResponse],
    mk_finding: Callable[..., dict],
) -> List[dict]:
    findings: List[dict] = []
    seen: set = set()
    for response in responses:
        if not response:
            continue
        tokens = list(extract_jwts(response.body))
        for key, value in response.headers.items():
            if key.lower() == "set-cookie":
                tokens.extend(extract_jwts(value))
        for token in tokens:
            if token in seen:
                continue
            seen.add(token)
            decoded = decode_jwt(token)
            if not decoded:
                continue
            risks = jwt_risks(decoded)
            if not risks:
                continue
            findings.append(
                mk_finding(
                    type_="Discovered JWT With Risky Properties",
                    severity="medium",
                    endpoint=response.url,
                    description="A JWT extracted from a response body or Set-Cookie header has risky claims.",
                    owasp=label("W:A07", "API:2"),
                    confidence="high",
                    evidence=f"{summarize_claims(decoded)}; risks={'; '.join(risks)}",
                    reproduction=[
                        f"Capture the response from {response.url}.",
                        "Decode the JWT header/payload (do not verify the signature).",
                    ],
                    impact="Tokens can leak identity/authorization details or be long-lived.",
                    remediation="Use short-lived signed tokens with minimal claims; pin verification algorithms.",
                    validated=True,
                )
            )
    return findings


# ---------------------------------------------------------------------------
# Probe: GraphQL introspection
# ---------------------------------------------------------------------------

_INTROSPECTION_QUERY = (
    '{"query":"{__schema{queryType{name} mutationType{name} subscriptionType{name} '
    'types{name kind}}}"}'
)


def _graphql_findings(
    target_root: str,
    endpoints: Iterable[str],
    mk_finding: Callable[..., dict],
    explicit: Optional[str] = None,
) -> List[dict]:
    findings: List[dict] = []
    candidates: List[str] = []
    if explicit:
        candidates.append(explicit)
    candidates.extend(_graphql_candidate_paths(target_root, endpoints))
    if not candidates:
        return findings
    for url in dict.fromkeys(candidates):
        res, _err = request(url, method="POST", headers={"Content-Type": "application/json"}, follow_redirects=False)
        if res is None:
            continue
        get_res = get(url)
        if not get_res or get_res.status >= 500:
            continue
        introspection = _post_introspection(url)
        if not introspection:
            continue
        body = introspection.body.lower()
        if "__schema" not in body:
            continue
        try:
            data = json.loads(introspection.body)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict) or "data" not in data:
            continue
        types = (((data.get("data") or {}).get("__schema") or {}).get("types") or [])
        type_names = ", ".join(sorted({str(t.get("name")) for t in types if isinstance(t, dict)})[:12])
        findings.append(
            mk_finding(
                type_="GraphQL Introspection Enabled",
                severity="medium",
                endpoint=url,
                description="The GraphQL endpoint accepted an introspection query and returned a schema.",
                owasp=label("API:9", "W:A05"),
                confidence="high",
                evidence=f"types (sample): {type_names}",
                reproduction=[
                    f"POST `{_INTROSPECTION_QUERY}` to {url} with Content-Type: application/json.",
                    "Observe a JSON response containing __schema.types.",
                ],
                impact="Public introspection lets attackers map the entire GraphQL surface.",
                remediation="Disable introspection in production; require authentication for schema queries.",
                validated=True,
            )
        )
    return findings


def _graphql_candidate_paths(target_root: str, endpoints: Iterable[str]) -> List[str]:
    found: List[str] = []
    seen: set = set()
    base = target_root.rstrip("/") + "/"
    for url in endpoints:
        path = urlparse(str(url)).path.lower()
        if "graphql" in path or path.endswith("/graphiql"):
            absolute = url if url.startswith(("http://", "https://")) else urljoin(base, url.lstrip("/"))
            if absolute not in seen:
                seen.add(absolute)
                found.append(absolute)
    return found


def _post_introspection(url: str) -> Optional[HttpResponse]:
    req = Request(
        url,
        data=_INTROSPECTION_QUERY.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "auto_scanner-http_checks/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as handle:
            raw = handle.read(256_000)
            return HttpResponse(
                url=url,
                status=int(handle.getcode() or 0),
                headers=dict(handle.headers.items()),
                body=raw.decode("utf-8", "replace"),
            )
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Probe: info disclosure (robots.txt / sitemap.xml)
# ---------------------------------------------------------------------------

def _info_disclosure_findings(target_root: str, mk_finding: Callable[..., dict]) -> List[dict]:
    findings: List[dict] = []
    robots = get(urljoin(target_root, "robots.txt"))
    if robots and robots.status == 200 and "disallow" in robots.body.lower():
        findings.append(
            mk_finding(
                type_="robots.txt Reveals Disallowed Paths",
                severity="info",
                endpoint=robots.url,
                description="robots.txt is reachable and lists Disallow paths worth reviewing during assessment.",
                owasp=label("API:9"),
                confidence="medium",
                evidence=_first_disallows(robots.body)[:300],
                impact="robots.txt is informational only, but its content can highlight non-public paths.",
                remediation="Do not place sensitive paths in robots.txt; require authorisation server-side instead.",
                validated=True,
            )
        )
    sitemap = get(urljoin(target_root, "sitemap.xml"))
    if sitemap and sitemap.status == 200 and "<url>" in sitemap.body.lower():
        findings.append(
            mk_finding(
                type_="sitemap.xml Reveals URL Inventory",
                severity="info",
                endpoint=sitemap.url,
                description="The server publishes a sitemap that enumerates URLs.",
                owasp=label("API:9"),
                confidence="medium",
                evidence=_first_locs(sitemap.body)[:300],
                impact="sitemap.xml is informational only, but it expands the discovered attack surface.",
                remediation="Restrict sitemap content to genuinely public URLs.",
                validated=True,
            )
        )
    return findings


def _first_disallows(body: str) -> str:
    return ", ".join(
        line.strip()
        for line in body.splitlines()
        if line.strip().lower().startswith("disallow")
    )[:400]


def _first_locs(body: str) -> str:
    out: List[str] = []
    text = body.lower()
    pos = 0
    while True:
        start = text.find("<loc>", pos)
        if start < 0:
            break
        end = text.find("</loc>", start)
        if end < 0:
            break
        out.append(body[start + 5 : end].strip())
        pos = end + 6
        if len(out) >= 8:
            break
    return ", ".join(out)


# ---------------------------------------------------------------------------
# Probe: route catalog
# ---------------------------------------------------------------------------

def _route_catalog_findings(target_root: str, mk_finding: Callable[..., dict]) -> List[dict]:
    findings: List[dict] = []
    for rel in ("api", "api/"):
        probe_url = urljoin(target_root, rel)
        res = get(probe_url)
        if not res or res.status != 200:
            continue
        try:
            data = json.loads(res.body)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        catalog = data.get("endpoints") or data.get("routes")
        privileged = route_catalog_suggests_privileged_paths(data)
        if catalog is None and not privileged:
            continue
        severity = "high" if privileged else "medium"
        owasp = label("API:9", "W:A01") if privileged else label("API:9")
        keys = [str(k) for k in data.keys()]
        evidence = "top-level JSON keys: " + ", ".join(keys[:15]) + (" …" if len(keys) > 15 else "")
        findings.append(
            mk_finding(
                type_="Public API route catalog exposes endpoint map",
                severity=severity,
                endpoint=res.url,
                description=(
                    "The server returned a structured JSON route catalog without authentication. "
                    "Listing admin, checkout, or account endpoints simplifies access-control attacks."
                ),
                owasp=owasp,
                confidence="high",
                evidence=evidence,
                reproduction=[
                    f"Send GET {res.url} with no cookies or Authorization header.",
                    "Review the JSON for route/endpoint listings.",
                ],
                impact="Attackers map the full API — including sensitive operations — before any blind guessing.",
                remediation="Remove or authenticate machine-readable API indexes in production.",
                validated=True,
            )
        )
        return findings
    return findings


# ---------------------------------------------------------------------------
# Probe: reachability
# ---------------------------------------------------------------------------

def _make_unreachable_finding(target_url: str, error_message: str, mk_finding: Callable[..., dict]) -> dict:
    return mk_finding(
        type_="Scan target unreachable (connection failed)",
        severity="info",
        endpoint=target_url.rstrip("/"),
        description=(
            "No HTTP probe returned a usable response — the base URL refused the connection or timed out. "
            "This is normally an environment/network problem (wrong URL, server not started, wrong port), "
            "not evidence that the target has no vulnerabilities."
        ),
        owasp=label("API:9"),
        confidence="high",
        evidence=error_message,
        reproduction=[
            f"From the same environment: curl -sv {target_url.rstrip('/')}",
            "Verify the target is bound on the configured host:port and reachable from the scanner host.",
        ],
        impact="Assessment cannot proceed until the target responds to TCP/HTTP.",
        remediation="Confirm the URL, port, and network/firewall path; rerun once the target is reachable.",
        validated=False,
    )


# ---------------------------------------------------------------------------
# Scanner class
# ---------------------------------------------------------------------------

class HttpChecksScanner(BaseScanner):
    name = "http_checks"
    binary = ""

    def is_available(self) -> bool:
        return True

    def run(self) -> Tuple[Optional[object], List[Finding]]:
        findings: List[Finding] = []
        root = self.ctx.target_url.rstrip("/") + "/"

        home, root_error = request(root)
        captured_responses: List[HttpResponse] = []
        if home:
            captured_responses.append(home)
            findings.extend(_header_findings(home, self.make_finding))
            findings.extend(cookie_findings(home, self.make_finding))
            findings.extend(csp_findings(home, self.make_finding))

        findings.extend(_route_catalog_findings(root, self.make_finding))
        findings.extend(_info_disclosure_findings(root, self.make_finding))

        probe_origin = str(self.ctx.extras.get("cors_probe_origin") or "https://probe.invalid")
        findings.extend(_cors_findings(root, probe_origin, self.make_finding))

        param_names = self.ctx.extras.get("open_redirect_param_names") or list(_REDIRECT_PARAMS)
        endpoints = self.ctx.extras.get("endpoints") or [self.ctx.target_url]
        findings.extend(redirect_findings(endpoints, param_names, self.make_finding))

        findings.extend(_jwt_audit_findings(captured_responses, self.make_finding))
        findings.extend(_graphql_findings(root, endpoints, self.make_finding))

        if not findings and root_error and looks_unreachable(root_error):
            findings.append(_make_unreachable_finding(self.ctx.target_url, root_error, self.make_finding))

        self.log.info("http_checks produced %d finding(s).", len(findings))
        return None, findings


__all__ = [
    "HttpChecksScanner",
    "HttpResponse",
    "cookie_findings",
    "csp_findings",
    "looks_unreachable",
    "redirect_findings",
    "request",
    "get",
]
