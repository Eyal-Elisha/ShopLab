"""Authenticated probe suite.

Probe logic: ``probes.py``
Finding text / constants / helpers: ``templates.py``
Scanner class + workflow: ``scanner.py``
"""

from .scanner import AuthenticatedProbesScanner, ExploitChainScanner
from .templates import _extract_role, _format_payload, _is_admin, extract_role, format_payload, is_admin

__all__ = [
    "AuthenticatedProbesScanner",
    "ExploitChainScanner",
    "_extract_role",
    "_format_payload",
    "_is_admin",
    "extract_role",
    "format_payload",
    "is_admin",
]
