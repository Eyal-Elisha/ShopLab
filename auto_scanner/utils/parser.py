"""Shared parsing helpers used by the scanner wrappers.

This module deliberately avoids importing any of the scanners to keep
the dependency direction one-way (scanners -> utils).
"""

from __future__ import annotations

import re
from typing import Iterable, Iterator, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse


VALID_SEVERITIES = ("info", "low", "medium", "high", "critical")


_DIRB_FOUND_RE = re.compile(r"^\+\s+(https?://\S+)\s+\(CODE:\s*(\d+).*?\)", re.MULTILINE)
_DIRB_DIR_RE = re.compile(r"^==>\s+DIRECTORY:\s+(https?://\S+)", re.MULTILINE)


SQLMAP_PARAM_RE = re.compile(
    r"Parameter:\s+(?P<param>[\w\-]+)\s+\((?P<place>[^)]+)\)\s*\n"
    r"\s*Type:\s+(?P<type>[^\n]+)\n"
    r"\s*Title:\s+(?P<title>[^\n]+)",
    re.MULTILINE,
)


_ZAP_RISK_TO_SEVERITY = {
    "informational": "info",
    "info": "info",
    "low": "low",
    "medium": "medium",
    "high": "high",
    "critical": "critical",
}


def normalize_severity(value: Optional[str]) -> str:
    """Map any tool-specific severity label onto our canonical scale.

    Unknown values fall back to ``"info"`` so the report never breaks.
    """

    if not value:
        return "info"
    cleaned = value.strip().lower().split()[0].rstrip(":")
    if cleaned in VALID_SEVERITIES:
        return cleaned
    return _ZAP_RISK_TO_SEVERITY.get(cleaned, "info")


def severity_rank(value: str) -> int:
    """Return a numeric ordering (higher = more severe)."""

    try:
        return VALID_SEVERITIES.index(normalize_severity(value))
    except ValueError:
        return 0


def parse_dirb_output(text: str) -> List[str]:
    """Extract discovered URLs from a dirb text-mode report.

    Both the ``+`` (file) markers and the ``==> DIRECTORY:`` markers are
    captured. Order is preserved and duplicates are removed.
    """

    seen: List[str] = []
    seen_set = set()
    for match in _DIRB_FOUND_RE.finditer(text):
        url = match.group(1).rstrip(",.")
        if url not in seen_set:
            seen.append(url)
            seen_set.add(url)
    for match in _DIRB_DIR_RE.finditer(text):
        url = match.group(1).rstrip(",.")
        if url not in seen_set:
            seen.append(url)
            seen_set.add(url)
    return seen


def parse_sqlmap_log(text: str) -> Iterator[Tuple[str, str, str]]:
    """Yield ``(parameter, technique, title)`` tuples from a sqlmap log."""

    for match in SQLMAP_PARAM_RE.finditer(text):
        yield (
            match.group("param").strip(),
            match.group("type").strip(),
            match.group("title").strip(),
        )


def has_query_string(url: str) -> bool:
    """Return ``True`` when ``url`` carries at least one query parameter."""

    try:
        return bool(urlparse(url).query)
    except ValueError:
        return False


def root_url(url: str) -> str:
    """Return ``scheme://netloc/`` for ``url``."""

    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, "/", "", "", ""))


def is_loopback(url: str) -> bool:
    """Return ``True`` when ``url``'s host is a loopback / private literal.

    Used by the safety gate in ``main.py`` to decide whether
    ``--accept-risk`` is required.
    """

    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    if not host:
        return False
    if host in {"localhost", "127.0.0.1", "::1", "0.0.0.0"}:
        return True
    return host.endswith(".localhost") or host.endswith(".local")


def chunk(seq: Iterable[str], size: int) -> Iterator[List[str]]:
    """Yield ``size``-sized lists from ``seq``."""

    bucket: List[str] = []
    for item in seq:
        bucket.append(item)
        if len(bucket) >= size:
            yield bucket
            bucket = []
    if bucket:
        yield bucket
