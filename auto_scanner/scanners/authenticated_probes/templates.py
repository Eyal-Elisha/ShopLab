"""Constants, credential helpers, and finding text for the authenticated probe suite."""

from __future__ import annotations

import re
from typing import Any, Dict, Set, Tuple

from utils.owasp_taxonomy import label

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_REGISTRATION_PATH = "api/auth/register"
DEFAULT_LOGIN_PATH = "api/auth/login"
DEFAULT_PROFILE_PATHS: Tuple[str, ...] = (
    "api/auth/profile",
    "api/account",
    "api/account/me",
    "api/users/me",
    "api/me",
    "api/profile",
)

DEFAULT_REGISTRATION_PAYLOAD: Dict[str, Any] = {
    "username": "{username}",
    "email": "{email}",
    "password": "{password}",
    "firstName": "Auto",
    "lastName": "Scanner",
}
DEFAULT_LOGIN_PAYLOAD: Dict[str, Any] = {
    "username": "{username}",
    "password": "{password}",
}

DEFAULT_COUPON_BODY_FIELDS = ("code", "coupon", "voucher", "promoCode", "promo")

INTERNAL_CODE_BASE_WORDLIST: Tuple[str, ...] = (
    "INTERNAL", "STAFF", "ADMIN", "QA", "TEST", "DEV", "BETA",
    "PROMO", "VOUCHER", "DEBUG", "OVERRIDE", "FREE", "WELCOME",
)

DEFAULT_ESCALATION_HEADERS: Tuple[str, ...] = (
    "X-Promo-Key", "X-Admin-Key", "X-Internal-Key", "X-Debug-Key",
    "X-Api-Key", "X-Override", "X-Internal", "X-Override-Role",
)

MASS_ASSIGN_PAYLOADS: Tuple[Dict[str, Any], ...] = (
    {"role": "admin"},
    {"role": "administrator"},
    {"isAdmin": True},
    {"is_admin": True},
    {"admin": True},
)

DEFAULT_PUT_PROBE_BODIES: Tuple[Dict[str, Any], ...] = (
    {"name": "__auto_scan_probe__"},
    {"name": "Eval"},
    {"description": "__auto_scan_probe__"},
)

COUPON_PATH_RE = re.compile(r"(coupon|voucher|promo|gift)\w*/(apply|redeem|use|validate)", re.I)
PROFILE_PATH_RE = re.compile(r"(account|profile|users?/me|/me)$", re.I)

SENSITIVE_PATH_MARKERS: Tuple[str, ...] = ("admin", "flag", "internal", "debug", "staff", "secret")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def format_payload(template: Any, creds: Dict[str, str]) -> Any:
    if isinstance(template, dict):
        return {k: format_payload(v, creds) for k, v in template.items()}
    if isinstance(template, list):
        return [format_payload(v, creds) for v in template]
    if isinstance(template, str):
        try:
            return template.format(**creds)
        except (KeyError, IndexError, ValueError):
            return template
    return template


def extract_role(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("role", "roles", "isAdmin", "is_admin", "admin", "permissions"):
            if key in value:
                v = value[key]
                if isinstance(v, str):
                    return v
                if isinstance(v, bool):
                    return "admin" if v else ""
                if isinstance(v, list) and v:
                    return ",".join(str(x) for x in v[:5])
        for v in value.values():
            found = extract_role(v)
            if found:
                return found
    return ""


def is_admin(role: str) -> bool:
    if not role:
        return False
    needles = ("admin", "administrator", "superuser", "owner", "root", "staff")
    return any(needle in role.lower() for needle in needles)


_format_payload = format_payload
_extract_role = extract_role
_is_admin = is_admin

# ---------------------------------------------------------------------------
# Finding templates
# ---------------------------------------------------------------------------

def _kb(**kwargs: Any) -> Dict[str, Any]:
    return kwargs


def catalog_tokens(endpoint: str, codes: Set[str]):
    sample = ", ".join(sorted(codes)[:10])
    return _kb(
        type_="Catalog response includes credential-shaped strings",
        severity="low",
        endpoint=endpoint,
        description=(
            "An anonymously reachable index/catalog response triggered generic "
            "secret heuristics. Treat as informational until manually confirmed."
        ),
        owasp=label("W:A05", "API:9"),
        confidence="low",
        evidence=sample or "(none)",
        reproduction=["Fetch the configured catalog path(s); diff against intentional public data."],
        impact="Pre-auth disclosure can simplify subsequent testing.",
        remediation="Keep deployment secrets out of public metadata.",
        validated=True,
    )


def derived_numeric(url: str, token: str):
    return _kb(
        type_="Neighbour identifier returned token-shaped content",
        severity="critical",
        endpoint=url,
        description=(
            "Varying a numeric segment seen in crawler output produced HTTP 200 "
            "with token-shaped content for the harness account."
        ),
        owasp=label("W:A01", "API:1"),
        confidence="medium",
        evidence=token[:500],
        reproduction=[
            "Start from crawler URLs.",
            "Enumerate adjacent numeric identifiers with the harness account.",
        ],
        impact="Unauthorized object access cannot be ruled out without server-side authorization review.",
        remediation="Authorize per resource key; deny by default.",
        validated=True,
    )


def product_metadata(endpoint: str, evidence: str):
    return _kb(
        type_="Operational-looking fields returned to non-privileged caller",
        severity="medium",
        endpoint=endpoint,
        description="Authenticated response contained field names resembling internal/metadata usage.",
        owasp=label("W:A01", "API:3"),
        confidence="medium",
        evidence=evidence,
        reproduction=["Review the JSON for fields not needed by the client tier."],
        impact="Operational detail shrinks defender advantage.",
        remediation="Respond with minimized DTO projections.",
        validated=True,
    )


def state_change_success(url: str, token: str, payload_repr: str):
    return _kb(
        type_="Write verb succeeded for crawl-listed resource template",
        severity="critical",
        endpoint=url,
        description=f"Authenticated PUT succeeded for a crawl-listed resource template; payload snapshot: {payload_repr}.",
        owasp=label("W:A01", "API:5"),
        confidence="high",
        evidence=token[:500],
        reproduction=["Enumerate allowed verbs.", "Replay with minimal JSON deltas."],
        impact="Integrity and confidentiality depend on absent back-end authorization checks.",
        remediation="Centralize RBAC/function-level guards for mutations.",
        validated=True,
    )


def sql_echo(url: str, snippet: str):
    return _kb(
        type_="Database error wording echoed on crafted search parameter",
        severity="high",
        endpoint=url,
        description="Malformed search parameter produced database/driver-shaped error wording in the body.",
        owasp=label("W:A03", "API:8"),
        confidence="high",
        evidence=snippet,
        reproduction=["Repeat with parameterized logging disabled on a clone of the target."],
        impact="Injection or reconnaissance feasibility needs manual verification.",
        remediation="Use parameterized queries; return generic failures to clients.",
        validated=True,
    )


def jwt_none(url: str, path: str, token: str, payload_repr: str):
    return _kb(
        type_="Unsigned bearer token accepted (operator-supplied probe)",
        severity="critical",
        endpoint=url,
        description=(
            f"Optional alg=none JWT probe at {path} returned HTTP 200 with sensitive content "
            f"(matrix entry {payload_repr}). Requires --experimental-auth + operator config."
        ),
        owasp=label("W:A07", "API:2"),
        confidence="high",
        evidence=token[:400],
        reproduction=["Replay payload + path triple recorded in evidence using your JWT tool of choice."],
        impact="Trust in unsigned bearer claims breaks authentication.",
        remediation="Reject ``alg=none`` tokens; pin verification algorithms.",
        validated=True,
    )


def remember_cookie(url: str, path: str, cookie_name: str, user_id: int, username: str, evidence: str):
    return _kb(
        type_="Forged opaque session cookie accepted (operator-supplied probe)",
        severity="critical",
        endpoint=url,
        description=(
            f"Configured cookie `{cookie_name}` impersonated uid={user_id}/{username!r} on `/{path}`. "
            "Requires --experimental-auth and operator-supplied identities."
        ),
        owasp=label("W:A07", "API:2"),
        confidence="medium",
        evidence=evidence[:400],
        reproduction=["Requires deliberate operator configuration—not default behaviour."],
        impact="Reliance on reversible client-side proofs lets anyone impersonate any user.",
        remediation="Authenticate serialized session blobs cryptographically.",
        validated=True,
    )


def discovery_route_token(url: str, token: str, body_preview: str, note: str):
    return _kb(
        type_="Token-shaped payload on crawler-listed URL",
        severity="high",
        endpoint=url,
        description=f"GET succeeded for a risky-looking path ({note}).",
        owasp=label("W:A01", "API:5"),
        confidence="medium",
        evidence=f"{token[:200]} | preview={body_preview[:160]}",
        reproduction=["Open the endpoint in a manual replay tool with the same cookies."],
        impact="Treat as indicative until causal chain is understood.",
        remediation="Tighten route authorization.",
        validated=True,
    )


def harness_aborted(endpoint: str, reason: str):
    return _kb(
        type_="Authenticated harness did not establish a session",
        severity="info",
        endpoint=endpoint,
        description=f"Registration/login failed ({reason}).",
        owasp="",
        confidence="low",
        evidence=reason,
        reproduction=["Match `stateful` POST bodies/paths with the API contract."],
        impact="Automated authenticated checks were skipped.",
        remediation="Correct authentication configuration.",
        validated=False,
    )


def leaked_strings(endpoint: str, sample: str):
    return _kb(
        type_="Operational-looking strings mined from authenticated JSON",
        severity="high",
        endpoint=endpoint,
        description=f"Heuristics surfaced strings resembling codes/secrets ({sample}).",
        owasp=label("API:3", "W:A05"),
        confidence="high",
        evidence=sample[:800],
        reproduction=["Diff JSON against the documented public schema."],
        impact="Leakage may enable chaining by any logged-in caller.",
        remediation="Filter fields at serialization time.",
        validated=True,
    )


def coupon_verbose(endpoint: str, sample: str):
    return _kb(
        type_="Workflow POST returned more than the nominal coupon ack",
        severity="high",
        endpoint=endpoint,
        description="Coupon-style endpoint surfaced JSON beyond the nominal acknowledgement.",
        owasp=label("API:3", "W:A05"),
        confidence="high",
        evidence=sample[:800],
        reproduction=["Enumerate POST URLs from discovery; fuzz conservatively.", "Inspect non-essential keys."],
        impact="Operational detail may bleed through workflow controllers.",
        remediation="Separate privileged diagnostics from storefront paths.",
        validated=True,
    )


def profile_mutation(endpoint: str, evidence: str, info: Dict[str, Any]):
    return _kb(
        type_="Profile/account mutation appears to have changed role",
        severity="critical",
        endpoint=endpoint,
        description=(
            f"`{info['method']}` on `{endpoint}` with header `{info['header_name']}` was followed by a "
            "profile read implying stronger capabilities. Confirm manually."
        ),
        owasp=label("W:A01", "API:5"),
        confidence="medium",
        evidence=evidence[:800],
        reproduction=["Replay verb/body/header triple from evidence after isolating secrets."],
        impact="Authorization bypass if reproducible.",
        remediation="Whitelist mutable fields; enforce per-mutation RBAC.",
        validated=True,
    )


def post_escalation_token(url: str, token_preview: str, info: Dict[str, Any]):
    return _kb(
        type_="Sensitive token observed after plausible privilege change",
        severity="critical",
        endpoint=url,
        description="A follow-up GET on a crawler-listed URL returned noteworthy content shortly after fuzzing.",
        owasp=label("W:A01", "API:1"),
        confidence="medium",
        evidence=f"{token_preview[:200]} | context={info.get('method')} {info.get('path')}",
        reproduction=["Document cookie/JWT deltas before submitting."],
        impact="Needs manual corroboration to attribute root cause.",
        remediation="Defense-in-depth across account + privileged routes.",
        validated=True,
    )
