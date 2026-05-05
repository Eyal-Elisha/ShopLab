"""CLI: orchestrates scanners, merges findings, writes JSON/HTML under ``results/``.

See ``scanner_config.example.json`` and ``--help`` for options.
"""

from __future__ import annotations

import os
import sys

# Stale/deleted cwd breaks ``os.path.abspath(__file__)`` when ``__file__`` is
# relative (common with ``python3 main.py``). Establish a valid cwd first, then
# resolve the package root; prefer absolute ``python3 /path/to/main.py``.
try:
    os.getcwd()
except (FileNotFoundError, PermissionError, OSError):  # pragma: no cover
    for anchor in (os.environ.get("TMPDIR"), os.environ.get("TEMP"), "/tmp", "/"):
        if anchor and os.path.isdir(anchor):
            try:
                os.chdir(anchor)
                break
            except OSError:
                continue

_script_fp = os.path.abspath(__file__)
_SCRIPT_DIR = os.path.dirname(_script_fp)
try:
    os.chdir(_SCRIPT_DIR)
except OSError:
    pass

import argparse
import datetime as _dt
import importlib.util
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Sequence
from urllib.parse import urljoin, urlparse

ROOT = Path(_script_fp).resolve().parent
if not (ROOT / "scanners").is_dir():
    print(
        "auto_scanner: cannot resolve install directory (bad cwd or relative script path).\n"
        "Fix:  cd to auto_scanner, then run:\n"
        "     python3 main.py ...\n"
        "Or pass an absolute path:\n"
        "     python3 /mnt/c/path/to/auto_scanner/main.py ...",
        file=sys.stderr,
    )
    sys.exit(2)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scanners import (  # noqa: E402  (after sys.path tweak)
    ActiveApiScanner,
    ActiveWebScanner,
    AuthenticatedProbesScanner,
    BrowserScanner,
    DiscoveryScanner,
    DirbScanner,
    ExploitValidatorScanner,
    HttpChecksScanner,
    LlmProbeScanner,
    NiktoScanner,
    NucleiScanner,
    SslScanner,
    StatefulLabScanner,
    SqlmapScanner,
    ZapScanner,
)
from scanners.base import ScanContext  # noqa: E402
from utils.attack_planner import plan_attacks, split_discovery_selection  # noqa: E402
from utils.dedupe import dedupe_findings  # noqa: E402
from utils.logger import setup_logger  # noqa: E402
from utils.parser import is_loopback  # noqa: E402
from utils.report_generator import write_reports  # noqa: E402
from utils.runner import which  # noqa: E402
from utils.scanner_config import (  # noqa: E402
    apply_scan_profile,
    build_scan_extras,
    extra_endpoints,
    load_scanner_config,
    merged_timeout,
    merged_zap_docker,
    scanners_enabled_from_config,
    select_scanners,
    validation_config,
)
from utils.secret_harvest import detect_flag  # noqa: E402
from utils.surface_model import build_surface_model  # noqa: E402


SCANNER_REGISTRY = {
    "http_checks": HttpChecksScanner,
    "discovery": DiscoveryScanner,
    "active_web": ActiveWebScanner,
    "active_api": ActiveApiScanner,
    "ssl": SslScanner,
    "stateful_lab": StatefulLabScanner,
    "authenticated_probes": AuthenticatedProbesScanner,
    "browser": BrowserScanner,
    "llm_probe": LlmProbeScanner,
    "dirb": DirbScanner,
    "exploit_validator": ExploitValidatorScanner,
    "sqlmap": SqlmapScanner,
    "nuclei": NucleiScanner,
    "zap": ZapScanner,
    "nikto": NiktoScanner,
}

# Order: discovery first, then broad external scanners before targeted validators.
SCANNER_ORDER = (
    "http_checks",
    "discovery",
    "browser",
    "dirb",
    "ssl",
    "zap",
    "nuclei",
    "active_web",
    "active_api",
    "stateful_lab",
    "authenticated_probes",
    "exploit_validator",
    "llm_probe",
    "sqlmap",
    "nikto",
)


_BANNER = r"""
================================================================
                  auto_scanner - EDUCATIONAL USE ONLY
   Only test systems you own or have explicit written authority
   to assess. The maintainers accept no responsibility for misuse.
================================================================
"""


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="auto_scanner",
        description="Automated web vulnerability scanner orchestrator.",
    )
    parser.add_argument(
        "--url",
        help="Target URL (e.g. http://localhost:3000). Required unless --check-tools is used.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(ROOT / "results"),
        help="Directory where per-run output folders are created (default: ./results).",
    )
    parser.add_argument(
        "--skip",
        action="append",
        choices=sorted(SCANNER_REGISTRY.keys()),
        default=[],
        help="Skip a specific scanner. May be repeated.",
    )
    parser.add_argument(
        "--only",
        action="append",
        choices=sorted(SCANNER_REGISTRY.keys()),
        default=[],
        help="Run only the listed scanner(s). May be repeated.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=None,
        help="Per-tool wall-clock timeout in seconds (overrides config; default: config or 900).",
    )
    parser.add_argument(
        "--config",
        default=str(ROOT / "scanner_config.json"),
        help="Path to JSON config (scanner toggles, timeout, zap_docker). "
        "If the file is missing, built-in defaults are used.",
    )
    parser.add_argument(
        "--zap-docker",
        action="store_true",
        help="Use the zaproxy/zap-stable Docker image instead of a native ZAP install.",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Force phase-2 validation/exploit attempts even if config disables validation.",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Run discovery only and skip phase-2 validation/exploit attempts.",
    )
    parser.add_argument(
        "--active",
        action="store_true",
        help="Enable built-in active Web/API probes. Intended for authorized labs.",
    )
    parser.add_argument(
        "--authenticated-probes",
        action="store_true",
        help="Enable the authenticated probe scanner (registers a temp user, "
        "harvests structurally interesting strings, attempts generic mass-assignment / "
        "header escalation, surfaces any token-shaped payload). Requires --accept-risk.",
    )
    parser.add_argument(
        "--experimental-auth",
        action="store_true",
        help="Permit destructive opt-in authenticated probes (alg=none JWT crafting, "
        "forged opaque session cookies). All payload matrices, paths, and identities "
        "must be supplied via the config; the scanner has no built-in fallbacks.",
    )
    parser.add_argument(
        "--llm-probe-url",
        default=None,
        metavar="URL",
        help="Trigger the LLM probe scanner against the given chat/completions endpoint "
        "(otherwise the probe only fires when discovery surfaces a chat-like path).",
    )
    parser.add_argument(
        "--extra-endpoint",
        action="append",
        default=[],
        metavar="URL",
        help="Extra URL to seed into the discovered-endpoint pool "
        "(stacks on top of the config). May be repeated.",
    )
    parser.add_argument(
        "--accept-risk",
        action="store_true",
        help="Required when scanning non-loopback hosts. Confirms you have authorisation.",
    )
    parser.add_argument(
        "--check-tools",
        action="store_true",
        help="Print a tool-availability matrix and exit.",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable DEBUG-level console logging.",
    )
    return parser.parse_args(argv)


def _print_banner() -> None:
    print(_BANNER, flush=True)


def _check_tools() -> int:
    print("Tool availability:")
    print("-" * 48)
    builtins = {
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
    }
    for name, cls in SCANNER_REGISTRY.items():
        if name == "browser":
            status = (
                "OK  (Playwright)"
                if importlib.util.find_spec("playwright") is not None
                else "optional (install Playwright to enable)"
            )
            print(f"  {name:<22} {status}")
            continue
        if name == "zap":
            if which("zap-baseline.py"):
                print(f"  {name:<22} OK  (zap-baseline.py)")
                continue
            if which("docker"):
                print(
                    f"  {name:<22} OK  (Docker image zaproxy/zap-stable — use "
                    f"--zap-docker or \"zap_docker\": true in scanner_config.json)"
                )
                continue
            print(f"  {name:<22} missing  (install ZAP or Docker; see setup.md)")
            continue

        if name in builtins:
            binaries = []
        elif name == "nikto":
            binaries = ["nikto", "nikto.pl"]
        else:
            binaries = [cls.binary]
        found = next((b for b in binaries if which(b)), None)
        status = (
            "OK  (built-in)"
            if name in builtins
            else f"OK  ({found})"
            if found
            else "missing"
        )
        print(f"  {name:<22} {status}")
    if which("docker"):
        print(f"  {'docker':<8} OK  (docker)")
    else:
        print(f"  {'docker':<8} missing  (only required for --zap-docker)")
    print("-" * 48)
    print("See setup.md for install instructions.")
    return 0


def _running_under_wsl() -> bool:
    """Best-effort detect WSL (Linux guest running under Windows)."""

    try:
        with open("/proc/version", encoding="utf-8", errors="ignore") as fh:
            return "microsoft" in fh.read().lower()
    except OSError:
        return False


def _url_targets_linux_loopback(url: str) -> bool:
    """True when the URL host is localhost / 127.0.0.1 / ::1 (not LAN IPs)."""

    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host in {"localhost", "127.0.0.1", "::1"}


def _resolve_seed_endpoint(target_url: str, endpoint: str) -> str:
    """Resolve config/CLI seed endpoints relative to the selected target URL."""

    value = str(endpoint).strip()
    if not value:
        return value
    if value.startswith(("http://", "https://")):
        return value
    return urljoin(target_url.rstrip("/") + "/", value.lstrip("/"))


def _build_run_dir(target_url: str, output_root: Path) -> Path:
    timestamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    host = re.sub(r"[^A-Za-z0-9_.-]+", "_",
                  target_url.split("//", 1)[-1].split("/", 1)[0]) or "target"
    run_dir = output_root / f"{timestamp}_{host}"
    (run_dir / "raw").mkdir(parents=True, exist_ok=True)
    return run_dir


def _run_one_scanner(
    name: str,
    ctx: ScanContext,
    logger,
    durations: Dict[str, float],
    used_tools: List[str],
) -> List[dict]:
    cls = SCANNER_REGISTRY[name]
    scanner = cls(ctx)
    if not scanner.is_available():
        logger.warning("%s is not available or not applicable - skipping. See setup.md.", name)
        return []
    used_tools.append(name)
    start = _dt.datetime.now()
    _, scanner_findings = scanner.execute()
    durations[name] = (_dt.datetime.now() - start).total_seconds()
    _merge_finding_endpoints(ctx, scanner_findings)
    logger.info("%s contributed %d finding(s) in %.1fs", name, len(scanner_findings), durations[name])
    return list(scanner_findings)


def _merge_finding_endpoints(ctx: ScanContext, findings: Sequence[dict]) -> None:
    endpoints = list(ctx.extras.get("endpoints") or [ctx.target_url])
    seen = set(endpoints)
    added = 0
    for finding in findings:
        endpoint = str(finding.get("endpoint") or "").strip()
        if not endpoint.startswith(("http://", "https://")) or endpoint in seen:
            continue
        seen.add(endpoint)
        endpoints.append(endpoint)
        added += 1
    if added:
        ctx.extras["endpoints"] = endpoints


def _annotate_outcomes(findings: List[dict]) -> None:
    """Mark captured token-shaped flags without target-specific rules."""

    for finding in findings:
        evidence_blob = " ".join(
            str(finding.get(k) or "") for k in ("type", "description", "evidence")
        )
        flag = detect_flag(evidence_blob)
        if flag:
            finding["validation_kind"] = "exploit"
            finding["achieved"] = "flag-shaped token captured"
            finding["exploit_attempted"] = True
            finding["validated"] = True
            continue


def run(args: argparse.Namespace) -> int:
    _print_banner()

    if args.check_tools:
        return _check_tools()

    if not args.url:
        print("error: --url is required (or use --check-tools).", file=sys.stderr)
        return 2

    if not is_loopback(args.url) and not args.accept_risk:
        print(
            "refusing to scan a non-loopback host without --accept-risk.\n"
            "Pass --accept-risk to confirm you have authorisation.",
            file=sys.stderr,
        )
        return 3
    if args.active and not is_loopback(args.url) and not args.accept_risk:
        print(
            "refusing active probes on a non-loopback host without --accept-risk.",
            file=sys.stderr,
        )
        return 3

    output_root = Path(args.output_dir).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = _build_run_dir(args.url, output_root)

    logger = setup_logger(run_dir, verbose=args.verbose)
    logger.info("Run directory: %s", run_dir)
    logger.info("Target URL:    %s", args.url)

    if _running_under_wsl() and _url_targets_linux_loopback(args.url):
        logger.warning(
            "WSL: localhost / 127.0.0.1 refers to this Linux environment, not Windows. "
            "If the app runs on Windows, HTTP requests will fail from here. "
            "Prefer the Windows host IP from the default route: "
            "`ip route show default | awk '{print $3}'` (often 172.x.x.x), "
            "not only `/etc/resolv.conf` nameserver (e.g. 10.255.255.254 is DNS and "
            "often does not forward app ports). "
            "Then: --url http://<that-ip>:8080 --accept-risk — or run main.py from "
            "Windows PowerShell with --url http://localhost:8080. "
            "Bind the dev server to 0.0.0.0, not 127.0.0.1 only. See setup.md (WSL)."
        )

    config_path = Path(args.config).expanduser()
    try:
        config_data, loaded_cfg_path = load_scanner_config(config_path)
    except ValueError as exc:
        logger.error("%s", exc)
        return 2
    config_data = apply_scan_profile(config_data)
    default_cfg = (ROOT / "scanner_config.json").resolve()
    requested_cfg = config_path.expanduser().resolve()
    if loaded_cfg_path is not None:
        logger.info("Scanner configuration loaded from: %s", loaded_cfg_path)
    elif requested_cfg != default_cfg:
        logger.warning("Config file not found: %s — using defaults", requested_cfg)

    enabled_map = scanners_enabled_from_config(SCANNER_ORDER, config_data)
    timeout_seconds = merged_timeout(args.timeout, config_data, default=900)
    zap_docker_flag = merged_zap_docker(args.zap_docker, config_data)
    validation_cfg = validation_config(config_data)
    validation_enabled = bool(args.validate or validation_cfg.get("enabled", True))
    if args.no_validate:
        validation_enabled = False
    validation_intensity = str(validation_cfg.get("intensity") or "safe")
    disabled = [n for n in SCANNER_ORDER if not enabled_map.get(n, True)]
    if disabled:
        logger.info(
            "Scanners disabled via config (--only overrides): %s",
            ", ".join(disabled),
        )

    # ------------------------------------------------------------------
    # Build the seed endpoint list:
    #   * the original target URL,
    #   * any user-supplied extra_endpoints from the config,
    #   * any extra URLs the CLI passes via --extra-endpoint.
    # ------------------------------------------------------------------
    seed_endpoints: List[str] = [args.url]
    cfg_extra = extra_endpoints(config_data)
    if cfg_extra:
        seed_endpoints.extend(cfg_extra)
        logger.info("Loaded %d extra endpoint(s) from config.", len(cfg_extra))
    cli_extra = list(args.extra_endpoint or [])
    if cli_extra:
        seed_endpoints.extend(cli_extra)
        logger.info("Loaded %d extra endpoint(s) from CLI.", len(cli_extra))
    seed_endpoints = list(dict.fromkeys(_resolve_seed_endpoint(args.url, endpoint) for endpoint in seed_endpoints))

    ctx_extras = build_scan_extras(
        config_data,
        args,
        seed_endpoints,
        zap_docker_flag,
        validation_cfg,
        validation_enabled=validation_enabled,
        accept_risk=bool(args.accept_risk or is_loopback(args.url)),
    )

    ctx = ScanContext(
        target_url=args.url,
        run_dir=run_dir,
        raw_dir=run_dir / "raw",
        timeout=timeout_seconds,
        extras=ctx_extras,
    )

    selected = select_scanners(
        SCANNER_ORDER,
        only=args.only,
        skip=args.skip,
        enabled_map=enabled_map,
    )
    discovery_selected = split_discovery_selection(selected)
    logger.info("Phase 1 discovery scanners scheduled: %s", ", ".join(discovery_selected) or "(none)")

    findings: List[dict] = []
    durations: Dict[str, float] = {}
    used_tools: List[str] = []

    for name in discovery_selected:
        scanner_findings = _run_one_scanner(name, ctx, logger, durations, used_tools)
        for finding in scanner_findings:
            finding.setdefault("phase", "discovery")
        findings.extend(scanner_findings)

    surface_model = build_surface_model(
        args.url,
        ctx.extras.get("endpoints") or [],
        findings,
        ctx.extras,
    )
    ctx.extras["surface_model"] = surface_model.to_dict()
    surface_path = surface_model.write(run_dir / "surface_model.json")
    logger.info(
        "Surface model: %d endpoint(s), %d API endpoint(s), %d query URL(s), candidates=%s",
        len(surface_model.endpoints),
        len(surface_model.api_endpoints),
        len(surface_model.query_urls),
        ", ".join(surface_model.candidate_attacks) or "(none)",
    )

    attack_plan = plan_attacks(
        selected,
        surface_model,
        validation_enabled=validation_enabled,
        intensity=validation_intensity,
        accept_risk=bool(ctx_extras.get("accept_risk")),
        config=config_data,
    )
    (run_dir / "attack_plan.json").write_text(json.dumps(attack_plan.to_dict(), indent=2), encoding="utf-8")
    logger.info("Phase 2 validation scanners scheduled: %s", ", ".join(attack_plan.validation_scanners) or "(none)")
    for name, reason in attack_plan.skipped.items():
        logger.info("Validation skip: %s - %s", name, reason)

    for name in attack_plan.validation_scanners:
        scanner_findings = _run_one_scanner(name, ctx, logger, durations, used_tools)
        for finding in scanner_findings:
            finding.setdefault("phase", "validation")
        findings.extend(scanner_findings)

    endpoints_path = run_dir / "endpoints.json"
    try:
        endpoints_path.write_text(
            json.dumps(ctx.extras.get("endpoints", []), indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.warning("Could not persist endpoints.json: %s", exc)

    _annotate_outcomes(findings)
    deduped = dedupe_findings(findings)
    logger.info(
        "De-duplicated findings: %d unique (from %d total).",
        len(deduped),
        len(findings),
    )

    meta = {
        "target": args.url,
        "run_id": run_dir.name,
        "generated_at": _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "config_file": str(loaded_cfg_path) if loaded_cfg_path else None,
        "config_scanners": enabled_map,
        "cli_only": sorted(args.only) if args.only else [],
        "cli_skip": sorted(args.skip) if args.skip else [],
        "timeout_seconds": timeout_seconds,
        "zap_docker": zap_docker_flag,
        "seed_endpoints_count": len(seed_endpoints),
        "zap_docker_network": ctx_extras.get("zap_docker_network"),
        "zap_docker_target_container": ctx_extras.get("zap_docker_target_container"),
        "dirb_wordlist": ctx_extras.get("dirb_wordlist"),
        "nuclei_tags": ctx_extras.get("nuclei_tags"),
        "sqlmap_max_targets": ctx_extras.get("sqlmap_max_targets"),
        "surface_model_path": str(surface_path),
        "surface_model": surface_model.to_dict(),
        "attack_plan": attack_plan.to_dict(),
        "validation_enabled": validation_enabled,
        "validation_intensity": validation_intensity,
        "active_mode": ctx_extras.get("active_mode"),
        "stateful_users_created": ctx_extras.get("stateful_users_created", 0),
        "browser_enabled": ctx_extras.get("browser_enabled"),
        "authenticated_probes_enabled": ctx_extras.get("authenticated_probes_enabled"),
        "experimental_auth": ctx_extras.get("experimental_auth"),
        "llm_probe_url": ctx_extras.get("llm_probe_url"),
        "auth_diff_status": ctx_extras.get("auth_diff_status"),
        "profile": config_data.get("profile"),
        "tools_used": used_tools,
        "tools_skipped": [n for n in selected if n not in used_tools],
        "durations_seconds": durations,
        "raw_findings": len(findings),
        "unique_findings": len(deduped),
    }

    paths = write_reports(deduped, run_dir, meta=meta)
    logger.info("JSON report: %s", paths["json"])
    logger.info("HTML report: %s", paths["html"])
    logger.info("Done.")
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        return run(args)
    except KeyboardInterrupt:
        print("\ninterrupted by user.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
