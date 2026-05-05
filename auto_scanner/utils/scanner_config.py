"""Optional JSON configuration for which scanners run and common options.

Copy ``scanner_config.example.json`` to ``scanner_config.json`` next to
``main.py`` and edit the booleans. The file is optional; if it is
missing, every scanner is enabled by default (same as before).

CLI flags still refine the selection: ``--only`` / ``--skip`` apply on
top of the file. ``--only`` always wins over ``false`` entries in the
file for the scanners you name.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple  # noqa: F401

_log = logging.getLogger("auto_scanner.config")


SCAN_PROFILES: Dict[str, Dict[str, Any]] = {
    "passive-only": {
        "active_mode": False,
        "scanners": {
            "http_checks": True,
            "discovery": True,
            "ssl": True,
            "active_web": False,
            "active_api": False,
            "stateful_lab": False,
            "authenticated_probes": False,
            "exploit_validator": False,
            "browser": False,
            "llm_probe": False,
            "dirb": True,
            "sqlmap": False,
            "nuclei": False,
            "nikto": True,
            "zap": True,
        },
    },
    "fast": {
        "active_mode": False,
        "timeout": 300,
        "scanners": {
            "http_checks": True,
            "discovery": True,
            "ssl": True,
            "active_web": False,
            "active_api": False,
            "stateful_lab": False,
            "authenticated_probes": False,
            "exploit_validator": False,
            "browser": False,
            "llm_probe": False,
            "dirb": False,
            "sqlmap": False,
            "nuclei": False,
            "nikto": True,
            "zap": True,
        },
    },
    "full": {
        "active_mode": False,
        "timeout": 600,
        "scanners": {
            "http_checks": True,
            "discovery": True,
            "ssl": True,
            "active_web": False,
            "active_api": False,
            "stateful_lab": False,
            "authenticated_probes": False,
            "exploit_validator": False,
            "browser": False,
            "llm_probe": False,
            "dirb": True,
            "sqlmap": True,
            "nuclei": True,
            "nikto": True,
            "zap": True,
        },
    },
    "active-lab": {
        "active_mode": True,
        "timeout": 600,
        "request_delay": 0.05,
        "scanners": {
            "http_checks": True,
            "discovery": True,
            "ssl": True,
            "active_web": True,
            "active_api": True,
            "stateful_lab": True,
            "authenticated_probes": True,
            "exploit_validator": True,
            "browser": False,
            "llm_probe": False,
            "dirb": True,
            "sqlmap": True,
            "nuclei": True,
            "nikto": True,
            "zap": True,
        },
    },
    "api-focused": {
        "active_mode": True,
        "timeout": 450,
        "scanners": {
            "http_checks": True,
            "discovery": True,
            "ssl": True,
            "active_web": False,
            "active_api": True,
            "stateful_lab": True,
            "authenticated_probes": True,
            "exploit_validator": True,
            "browser": False,
            "llm_probe": False,
            "dirb": False,
            "sqlmap": False,
            "nuclei": False,
            "nikto": False,
            "zap": True,
        },
    },
}


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def load_scanner_config(path: Path) -> Tuple[Dict[str, Any], Optional[Path]]:
    """Parse ``scanner_config.json`` (or another path).

    Returns ``({}, None)`` when the path does not exist. Raises
    :class:`ValueError` on invalid JSON.

    Raises
    ------
    ValueError
        When JSON is malformed or ``scanners`` is not an object mapping
        scanner names to booleans / bool-like strings.
    """

    path = path.expanduser().resolve()
    if not path.is_file():
        return {}, None
    # PowerShell 5 and some Windows tools write JSON with a UTF-8 BOM.
    # json.loads() rejects that when decoded as plain utf-8, so accept it.
    raw = path.read_text(encoding="utf-8-sig")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"Config root must be a JSON object in {path}")
    scanners = data.get("scanners")
    if scanners is not None and not isinstance(scanners, dict):
        raise ValueError("'scanners' must be an object of name -> boolean in config")
    if isinstance(scanners, dict):
        unknown = sorted(set(scanners) - _expected_scanner_names())
        if unknown:
            _log.warning("Ignoring unknown scanner names in config: %s", ", ".join(unknown))
    _log.debug("Loaded config from %s", path)
    return data, path


def _expected_scanner_names() -> set:
    # Avoid circular imports: duplicate the canonical scanner names.
    return {
        "http_checks",
        "discovery",
        "ssl",
        "active_web",
        "active_api",
        "stateful_lab",
        "authenticated_probes",
        "exploit_validator",
        "browser",
        "llm_probe",
        "dirb",
        "sqlmap",
        "nuclei",
        "zap",
        "nikto",
    }


def apply_scan_profile(data: Dict[str, Any]) -> Dict[str, Any]:
    """Merge a named scan profile into explicit config values.

    Explicit keys in ``data`` win over the profile. Scanner booleans are merged
    per scanner, so a profile can provide defaults while local config can toggle
    individual tools.
    """

    profile_name = str(data.get("profile") or "").strip().lower()
    if not profile_name:
        return dict(data)
    profile = SCAN_PROFILES.get(profile_name)
    if not profile:
        _log.warning("Unknown scan profile %r; using explicit config only", profile_name)
        return dict(data)
    merged = dict(profile)
    merged.update({k: v for k, v in data.items() if k != "scanners"})
    scanners = dict(profile.get("scanners") or {})
    scanners.update(data.get("scanners") or {})
    merged["scanners"] = scanners
    merged["profile"] = profile_name
    return merged


def scanners_enabled_from_config(all_names: Sequence[str], data: Dict[str, Any]) -> Dict[str, bool]:
    """Return ``name -> enabled`` merged with defaults (missing => True)."""

    block = data.get("scanners")
    resolved: Dict[str, bool] = {name: True for name in all_names}
    if not isinstance(block, dict):
        return resolved
    for key, raw in block.items():
        key_s = str(key).strip().lower()
        if key_s not in resolved:
            continue
        resolved[key_s] = _as_bool(raw)
    return resolved


def merged_timeout(cli_timeout: Optional[int], data: Dict[str, Any], default: int = 900) -> int:
    if cli_timeout is not None:
        return int(cli_timeout)
    if "timeout" in data:
        return int(data["timeout"])
    return default


def merged_zap_docker(cli_flag: bool, data: Dict[str, Any]) -> bool:
    if cli_flag:
        return True
    return _as_bool(data.get("zap_docker", False))


def select_scanners(
    order: Sequence[str],
    *,
    only: List[str],
    skip: List[str],
    enabled_map: Dict[str, bool],
) -> List[str]:
    """Apply config enable-flags, then CLI ``--only`` / ``--skip``.

    If ``only`` is non-empty, scanners are restricted to those names
    (order preserved), ``--skip`` still applies, and explicitly listed
    ``--only`` scanners run even when the config marked them disabled.
    """

    skip_set = set(skip)
    if only:
        only_set = set(only)
        return [n for n in order if n in only_set and n not in skip_set]
    return [n for n in order if enabled_map.get(n, True) and n not in skip_set]


# ---------------------------------------------------------------------------
# Optional configuration knobs (seed endpoints, dirb wordlist, nuclei tags,
# nikto args, ZAP docker networking).  Each helper returns a sensible default
# when its key is missing or invalid, so callers never have to defend
# themselves.
# ---------------------------------------------------------------------------


def extra_endpoints(data: Dict[str, Any]) -> List[str]:
    """Return user-supplied extra endpoint URLs from the config."""

    raw = data.get("extra_endpoints")
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    for item in raw:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def dirb_wordlist(data: Dict[str, Any]) -> Optional[str]:
    """Return optional dirb wordlist path."""

    val = data.get("dirb_wordlist")
    if isinstance(val, str) and val.strip():
        return val.strip()
    return None


def nuclei_tags(data: Dict[str, Any]) -> Optional[str]:
    """Return optional nuclei tag filter (comma-separated string)."""

    val = data.get("nuclei_tags")
    if isinstance(val, str) and val.strip():
        return val.strip()
    if isinstance(val, list):
        joined = ",".join(str(x).strip() for x in val if str(x).strip())
        return joined or None
    return None


def nikto_args(data: Dict[str, Any]) -> List[str]:
    """Return extra arguments to pass to nikto (rarely needed)."""

    val = data.get("nikto_args")
    if isinstance(val, list):
        return [str(x) for x in val]
    if isinstance(val, str) and val.strip():
        return val.strip().split()
    return []


def zap_docker_network(data: Dict[str, Any]) -> Optional[str]:
    """Return ZAP-Docker network preference.

    * ``None`` / missing  -> use ``--add-host=host-gateway`` fallback (default).
    * ``"auto"``           -> try to auto-detect the target container's network.
    * ``"<name>"``         -> join that named Docker network explicitly.
    """

    val = data.get("zap_docker_network")
    if val is None or val is False:
        return None
    if isinstance(val, str) and val.strip():
        return val.strip()
    return None


def zap_docker_target_container(data: Dict[str, Any]) -> Optional[str]:
    """Return optional Docker container name to use as the ZAP target."""

    val = data.get("zap_docker_target_container")
    if isinstance(val, str) and val.strip():
        return val.strip()
    return None


def llm_probe_url(data: Dict[str, Any]) -> Optional[str]:
    """Return an explicit LLM endpoint URL the operator wants probed (or ``None``)."""

    val = data.get("llm_probe_url")
    if isinstance(val, str) and val.strip():
        return val.strip()
    return None


def experimental_auth_enabled(data: Dict[str, Any]) -> bool:
    """Whether destructive opt-in auth probes (forged cookies, alg=none JWT) are enabled."""

    return _as_bool(data.get("experimental_auth", False))


def validation_config(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return normalized phase-2 validation settings."""

    raw = data.get("validation")
    cfg = dict(raw) if isinstance(raw, dict) else {}
    cfg.setdefault("enabled", True)
    cfg.setdefault("intensity", "safe")
    cfg.setdefault("zap_mode", data.get("zap_mode", "baseline"))
    return cfg


def build_scan_extras(
    config_data: Dict[str, Any],
    args: Any,
    seed_endpoints: List[str],
    zap_docker_flag: bool,
    validation_cfg: Dict[str, Any],
    *,
    validation_enabled: bool,
    accept_risk: bool,
) -> Dict[str, Any]:
    """Flatten config + CLI into the dict stored on ``ScanContext.extras``."""

    c = config_data
    return {
        "endpoints": seed_endpoints,
        "zap_use_docker": zap_docker_flag,
        "zap_docker_network": zap_docker_network(c),
        "zap_docker_target_container": zap_docker_target_container(c),
        "validation": validation_cfg,
        "validation_enabled": validation_enabled,
        "validation_intensity": str(validation_cfg.get("intensity") or "safe"),
        "zap_mode": validation_cfg.get("zap_mode", "baseline"),
        "dirb_wordlist": dirb_wordlist(c),
        "nuclei_tags": nuclei_tags(c),
        "nuclei_rate_limit": c.get("nuclei_rate_limit"),
        "nuclei_concurrency": c.get("nuclei_concurrency"),
        "nuclei_max_urls": c.get("nuclei_max_urls", 15),
        "nikto_args": nikto_args(c),
        "sqlmap_max_targets": c.get("sqlmap_max_targets", 5),
        "active_mode": bool(getattr(args, "active", False) or c.get("active_mode", False)),
        "accept_risk": accept_risk,
        "http_timeout": int(c.get("http_timeout", 10)),
        "request_delay": float(c.get("request_delay", 0.05)),
        "auth": c.get("auth") if isinstance(c.get("auth"), dict) else {},
        "stateful": c.get("stateful") if isinstance(c.get("stateful"), dict) else {},
        "stateful_enabled": c.get("stateful_enabled", True),
        "authenticated_probes_enabled": bool(
            getattr(args, "authenticated_probes", False) or c.get("authenticated_probes_enabled", False)
        ),
        "exploit_validator_id_budget": c.get("exploit_validator_id_budget", 80),
        "exploit_validator_file_budget": c.get("exploit_validator_file_budget", 40),
        "exploit_validator_sql_budget": c.get("exploit_validator_sql_budget", 40),
        "exploit_validator_id_ceiling": c.get("exploit_validator_id_ceiling", 12),
        "exploit_validator_product_limit": c.get("exploit_validator_product_limit", 20),
        "exploit_validator_register_path": c.get("exploit_validator_register_path"),
        "exploit_validator_login_path": c.get("exploit_validator_login_path"),
        "exploit_validator_jwt_paths": c.get("exploit_validator_jwt_paths") or [],
        "exploit_validator_jwt_payloads": c.get("exploit_validator_jwt_payloads") or [],
        "authenticated_probes_max_get": c.get("authenticated_probes_max_get", 60),
        "authenticated_probes_max_coupon": c.get("authenticated_probes_max_coupon", 80),
        "authenticated_probes_max_escalation": c.get("authenticated_probes_max_escalation", 120),
        "authenticated_probes_max_flag_probes": c.get("authenticated_probes_max_flag_probes", 30),
        "authenticated_probes_extra_codes": c.get("authenticated_probes_extra_codes") or [],
        "authenticated_probes_coupon_fields": c.get("authenticated_probes_coupon_fields") or [],
        "authenticated_probes_headers": c.get("authenticated_probes_headers") or [],
        "authenticated_probes_public_paths": c.get("authenticated_probes_public_paths"),
        "authenticated_probes_probe_derived_numeric_ids": c.get(
            "authenticated_probes_probe_derived_numeric_ids", True
        ),
        "authenticated_probes_probe_state_changing_writes": c.get(
            "authenticated_probes_probe_state_changing_writes", False
        ),
        "authenticated_probes_max_idor_templates": c.get("authenticated_probes_max_idor_templates", 48),
        "authenticated_probes_numeric_id_ceiling": c.get("authenticated_probes_numeric_id_ceiling", 36),
        "authenticated_probes_idor_budget": c.get("authenticated_probes_idor_budget", 160),
        "authenticated_probes_product_list_limit": c.get("authenticated_probes_product_list_limit", 48),
        "authenticated_probes_product_detail_max": c.get("authenticated_probes_product_detail_max", 12),
        "authenticated_probes_product_put_max": c.get("authenticated_probes_product_put_max", 24),
        "authenticated_probes_put_bodies": c.get("authenticated_probes_put_bodies") or [],
        "authenticated_probes_search_paths": c.get("authenticated_probes_search_paths") or [],
        "authenticated_probes_search_payloads": c.get("authenticated_probes_search_payloads") or [],
        "authenticated_probes_include_common_search_fallbacks": c.get(
            "authenticated_probes_include_common_search_fallbacks", False
        ),
        "authenticated_probes_probe_search_sql": c.get("authenticated_probes_probe_search_sql", True),
        "authenticated_probes_jwt_paths": c.get("authenticated_probes_jwt_paths") or [],
        "authenticated_probes_jwt_payloads": c.get("authenticated_probes_jwt_payloads") or [],
        "authenticated_probes_remember_cookie_names": c.get("authenticated_probes_remember_cookie_names") or [],
        "authenticated_probes_remember_identities": c.get("authenticated_probes_remember_identities") or [],
        "authenticated_probes_remember_flag_paths": c.get("authenticated_probes_remember_flag_paths") or [],
        "authenticated_probes_escalation_paths": c.get("authenticated_probes_escalation_paths") or [],
        "authenticated_probes_extra_coupon_urls": c.get("authenticated_probes_extra_coupon_urls") or [],
        "authenticated_probes_coupon_path_prefixes": c.get("authenticated_probes_coupon_path_prefixes") or [],
        "authenticated_probes_extra_sensitive_urls": c.get("authenticated_probes_extra_sensitive_urls") or [],
        "authenticated_probes_extra_sensitive_paths": c.get("authenticated_probes_extra_sensitive_paths") or [],
        "authenticated_probes_sensitive_path_needles": c.get("authenticated_probes_sensitive_path_needles") or [],
        "experimental_auth": bool(
            getattr(args, "experimental_auth", False) or experimental_auth_enabled(c)
        ),
        "llm_probe_url": getattr(args, "llm_probe_url", None) or llm_probe_url(c),
        "browser_enabled": c.get("browser_enabled", False),
        "browser_routes": c.get("browser_routes"),
        "browser_xss_payload": c.get("browser_xss_payload"),
        "discovery_max_pages": c.get("discovery_max_pages", 25),
        "discovery_max_scripts": c.get("discovery_max_scripts", 10),
        "active_web_max_param_tests": c.get("active_web_max_param_tests", 20),
        "active_api_max_get_tests": c.get("active_api_max_get_tests", 30),
        "access_control_paths": c.get("access_control_paths"),
        "sensitive_file_paths": c.get("sensitive_file_paths"),
        "open_redirect_param_names": c.get("open_redirect_param_names")
        or [
            "url",
            "next",
            "redirect",
            "redirect_uri",
            "to",
            "return",
            "returnTo",
            "returnUrl",
            "destination",
        ],
        "cors_probe_origin": c.get("cors_probe_origin", "https://probe.invalid"),
    }
