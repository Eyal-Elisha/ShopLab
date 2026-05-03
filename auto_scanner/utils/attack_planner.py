"""Plan validation tools from the generic surface model."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Sequence

from .surface_model import SurfaceModel


DISCOVERY_SCANNERS = ("http_checks", "discovery", "browser", "dirb")
ALWAYS_VALIDATION_SCANNERS = ("nikto", "zap")
API_VALIDATION_SCANNERS = (
    "active_web",
    "active_api",
    "stateful_lab",
    "authenticated_probes",
    "exploit_validator",
    "llm_probe",
)
CONDITIONAL_TOOL_SCANNERS = ("sqlmap", "nuclei", "ssl")


@dataclass
class AttackPlan:
    discovery_scanners: List[str] = field(default_factory=list)
    validation_scanners: List[str] = field(default_factory=list)
    skipped: Dict[str, str] = field(default_factory=dict)
    validation_enabled: bool = True
    intensity: str = "safe"

    def to_dict(self) -> dict:
        return {
            "discovery_scanners": self.discovery_scanners,
            "validation_scanners": self.validation_scanners,
            "skipped": self.skipped,
            "validation_enabled": self.validation_enabled,
            "intensity": self.intensity,
        }


def split_discovery_selection(selected: Sequence[str]) -> List[str]:
    return [name for name in selected if name in DISCOVERY_SCANNERS]


def plan_attacks(
    selected: Sequence[str],
    surface: SurfaceModel,
    *,
    validation_enabled: bool,
    intensity: str,
    accept_risk: bool,
    config: dict,
) -> AttackPlan:
    """Return the scanners justified for phase 2.

    ``selected`` is already filtered by config/CLI. This function only removes
    tools whose prerequisites were not observed or whose safety gate is closed.
    """

    plan = AttackPlan(
        discovery_scanners=split_discovery_selection(selected),
        validation_enabled=validation_enabled,
        intensity=normalize_intensity(intensity),
    )
    if not validation_enabled:
        plan.skipped["validation"] = "disabled by --no-validate or config"
        return plan
    if not accept_risk:
        plan.skipped["validation"] = "requires --accept-risk for validation phase"
        return plan

    selected_set = set(selected)
    for name in selected:
        if name in DISCOVERY_SCANNERS:
            continue
        reason = _skip_reason(name, surface, plan.intensity, config)
        if reason:
            plan.skipped[name] = reason
            continue
        plan.validation_scanners.append(name)

    # Keep deterministic order and avoid duplicates when new tools are selected
    # via config but also covered by generic buckets.
    plan.validation_scanners = _dedupe(plan.validation_scanners)

    # Explain conditionally disabled tools even when present in config defaults.
    for name in CONDITIONAL_TOOL_SCANNERS:
        if name not in selected_set:
            continue
        if name not in plan.validation_scanners and name not in plan.skipped:
            reason = _skip_reason(name, surface, plan.intensity, config)
            if reason:
                plan.skipped[name] = reason
    return plan


def normalize_intensity(value: str) -> str:
    cleaned = str(value or "safe").strip().lower()
    if cleaned in {"safe", "active", "aggressive-lab"}:
        return cleaned
    return "safe"


def _skip_reason(name: str, surface: SurfaceModel, intensity: str, config: dict) -> str:
    validation_cfg = config.get("validation") if isinstance(config.get("validation"), dict) else {}
    if name == "sqlmap" and not surface.query_urls and not config.get("sqlmap_after_broad_scans", True):
        return "no discovered URLs with query parameters"
    if name == "ssl" and not surface.is_https:
        return "target is not HTTPS"
    if name in {"active_api", "stateful_lab", "authenticated_probes"} and not surface.api_endpoints:
        return "no API-like endpoints were discovered"
    if name == "exploit_validator" and not (surface.api_endpoints or surface.endpoints):
        return "no discovered routes to validate"
    if name == "llm_probe" and "llm" not in surface.candidate_attacks:
        if config.get("llm_probe_url"):
            return ""
        # The scanner can still self-enable with an explicit URL, but the planner
        # avoids scheduling it from discovery alone unless a chat path exists.
        return "no chat/LLM endpoint was discovered"
    if name == "zap":
        zap_mode = str(validation_cfg.get("zap_mode") or config.get("zap_mode") or "baseline").lower()
        if zap_mode == "full" and intensity != "aggressive-lab":
            return "ZAP full scan requires validation.intensity='aggressive-lab'"
    return ""


def _dedupe(values: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out
