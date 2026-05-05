"""Scanner wrappers for the auto_scanner orchestrator.

Each module in this package exposes a class that subclasses
``scanners.base.BaseScanner`` and is responsible for invoking a single
external security tool, capturing its raw output and translating any
findings into the unified finding schema used by the report generator.
"""

from .base import BaseScanner, Finding
from .active_api_scanner import ActiveApiScanner
from .active_web_scanner import ActiveWebScanner
from .authenticated_probes import AuthenticatedProbesScanner
from .browser_scanner import BrowserScanner
from .dirb_scanner import DirbScanner
from .discovery_scanner import DiscoveryScanner
from .exploit_validator_scanner import ExploitValidatorScanner
from .http_checks import HttpChecksScanner
from .llm_probe_scanner import LlmProbeScanner
from .nikto_scanner import NiktoScanner
from .nuclei_scanner import NucleiScanner
from .ssl_scanner import SslScanner
from .stateful_lab_scanner import StatefulLabScanner
from .sqlmap_scanner import SqlmapScanner
from .zap_scanner import ZapScanner

# Back-compat alias kept until external scripts switch to AuthenticatedProbesScanner.
ExploitChainScanner = AuthenticatedProbesScanner

__all__ = [
    "BaseScanner",
    "Finding",
    "ActiveApiScanner",
    "ActiveWebScanner",
    "AuthenticatedProbesScanner",
    "BrowserScanner",
    "DiscoveryScanner",
    "DirbScanner",
    "ExploitChainScanner",
    "ExploitValidatorScanner",
    "HttpChecksScanner",
    "LlmProbeScanner",
    "NiktoScanner",
    "NucleiScanner",
    "SslScanner",
    "StatefulLabScanner",
    "SqlmapScanner",
    "ZapScanner",
]
