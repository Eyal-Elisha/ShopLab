"""Helpers to mine secrets, codes and flags from API responses.

Used by the exploit-chain scanner when it wants to reason about authenticated
response bodies. The helpers are deliberately generic - they look for fields
that smell secret-ish (debug blocks, *Key, *Secret, code, promo, internal,
admin, override, ...) and string tokens that look like codes / flags. No app
specific knowledge is hard coded here.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, List, Optional, Set


SECRET_KEY_HINT = re.compile(
    r"(key|secret|token|promo|admin|internal|debug|override|coupon|voucher|"
    r"promotion|code|password|hash|note|fulfillment|staff|hint|objective|summary|"
    r"trail|lesson|breadcrumb|access)",
    re.I,
)

CODE_TOKEN = re.compile(r"\b[A-Z][A-Z0-9_-]{4,40}\b")

FLAG_TOKEN = re.compile(
    r"\b([A-Z][A-Z0-9_]{2,30}\{[^}\s]{1,200}\}|flag\{[^}\s]{1,200}\})",
    re.I,
)


def extract_secrets(value: Any) -> Set[str]:
    """Return string tokens that could be secrets/codes harvested from ``value``.

    The walk recurses through dicts/lists. Strings whose containing key looks
    secret-ish are kept verbatim (they are probably the secret); any string
    is also scanned for UPPERCASE-LIKE tokens (e.g., codes leaked inside a
    free-text fulfillment note).
    """

    out: Set[str] = set()
    _walk_for_secrets(value, "", out)
    return out


def _walk_for_secrets(value: Any, parent_key: str, out: Set[str]) -> None:
    if isinstance(value, dict):
        for k, v in value.items():
            _walk_for_secrets(v, str(k), out)
    elif isinstance(value, list):
        for item in value:
            _walk_for_secrets(item, parent_key, out)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return
        if SECRET_KEY_HINT.search(parent_key):
            short = text if len(text) <= 200 else text[:200]
            if _looks_like_secret(short):
                out.add(short)
        for token in CODE_TOKEN.findall(text):
            if len(token) >= 5 and _looks_like_secret(token):
                out.add(token)


def detect_flag(value: Any) -> str:
    """Return the first flag-shaped string detected in ``value`` (else '')."""

    if isinstance(value, dict):
        flag = value.get("flag")
        if isinstance(flag, str) and flag.strip():
            return flag.strip()
        for k, v in value.items():
            if isinstance(k, str) and isinstance(v, str) and k.lower().endswith("_flag"):
                trimmed = v.strip()
                match = FLAG_TOKEN.search(trimmed)
                if match:
                    return match.group(0).strip()
                if trimmed.startswith("flag{") or "{" in trimmed:
                    return trimmed
        for v in value.values():
            found = detect_flag(v)
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = detect_flag(item)
            if found:
                return found
    elif isinstance(value, str):
        match = FLAG_TOKEN.search(value)
        if match:
            return match.group(0)
    return ""


def merge_wordlist(*sources: Iterable[str]) -> List[str]:
    """Return a de-duplicated, order-preserving list from multiple iterables."""

    seen: Set[str] = set()
    out: List[str] = []
    for src in sources:
        for raw in src:
            if not isinstance(raw, str):
                continue
            cleaned = raw.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            out.append(cleaned)
    return out


def host_derived_codes(host: Optional[str]) -> List[str]:
    """Generate plausible coupon-style codes derived from the target host slug.

    The codes are pure prefix/suffix combinations of the host slug; no
    year tags are baked in to avoid CTF-flavored guesses leaking into a
    generic tool. Operators who want time-stamped codes can pass them
    through ``authenticated_probes_extra_codes``.
    """

    if not host:
        return []
    cleaned = host.split(":", 1)[0]
    if cleaned in {"localhost", "127.0.0.1", "::1"}:
        return []
    slug = re.split(r"[._-]", cleaned)[0].upper()
    if not slug or len(slug) < 3:
        return []
    out: List[str] = []
    for prefix in ("INTERNAL", "STAFF", "QA", "TEST", "ADMIN"):
        out.append(f"{slug}-{prefix}")
        out.append(f"{prefix}-{slug}")
    return out


def _looks_like_secret(value: str) -> bool:
    if not value or len(value) > 200:
        return False
    if any(ch.isspace() for ch in value):
        return False
    return True
