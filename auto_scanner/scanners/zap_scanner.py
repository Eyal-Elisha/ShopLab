"""Wrapper around the OWASP ZAP baseline scan.

The baseline scan is preferred over a full active scan because:

* it is non-destructive (passive scanning + a small spider),
* it is bounded in time, and
* it produces a structured JSON report that is easy to parse.

The scanner supports two execution modes:

1. **Native** ``zap-baseline.py`` (when on ``$PATH``).
2. **Docker** ``zaproxy/zap-stable`` image when ``zap_use_docker`` is set
   in :class:`ScanContext.extras` (typically via ``--zap-docker``).

The Docker mode is the tricky one. WSL2 + Docker Desktop frequently
breaks ``host.docker.internal`` routing for newly-spawned containers,
which historically caused ``Network is unreachable`` failures. To make
the orchestrator actually-reliable, this module supports a richer set
of strategies (in order of preference):

* **Container-to-container** networking when ``zap_docker_target_container``
  identifies a target container on the local Docker daemon. The
  orchestrator inspects that container, ensures it is on a user-defined
  network (creating one if necessary), connects ZAP to that network and
  rewrites the target URL to ``http://<container>:<port>``. This is the
  most reliable mode and bypasses host-routing entirely.

* **Explicit network**: when ``zap_docker_network`` is a string (other
  than ``"auto"``) the ZAP container joins that network as-is.

* **Fallback to ``--add-host=host.docker.internal:host-gateway``**: the
  previous behaviour, kept for hosts where it works.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urlparse, urlunparse

from utils.parser import normalize_severity, root_url
from utils.runner import docker_cli, run_command, which

from .base import BaseScanner, Finding


_NATIVE_BINARIES = ("zap-baseline.py",)
_NATIVE_FULL_BINARIES = ("zap-full-scan.py",)
_AUTO_NETWORK_NAME = "auto_scanner_zap"


class ZapScanner(BaseScanner):
    name = "zap"
    binary = "zap-baseline.py"

    def is_available(self) -> bool:
        if self._zap_mode() == "full" and any(which(b) for b in _NATIVE_FULL_BINARIES):
            return True
        if any(which(b) for b in _NATIVE_BINARIES):
            return True
        if self.ctx.extras.get("zap_use_docker") and docker_cli():
            return True
        return False

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        report_json = self.raw_path("zap.json")
        if report_json.exists():
            report_json.unlink()

        cmd = self._build_command(report_json)
        if not cmd:
            self.log.warning("Could not assemble a ZAP command; skipping.")
            return None, []

        result = run_command(
            cmd,
            timeout=max(self.ctx.timeout, 1200),
            log_path=self.raw_path("zap.run.log"),
        )

        if result.not_found:
            return None, []

        combined_out = ((result.stdout or "") + "\n" + (result.stderr or "")).lower()
        if result.returncode != 0 and "could not be found in this wsl 2 distro" in combined_out:
            self.log.error(
                "Docker CLI failed (WSL stub). Enable Docker Desktop → Settings → "
                "Resources → WSL integration for this distro, restart Docker, "
                "or set AUTO_SCANNER_DOCKER to the real client (often "
                "/mnt/wsl/docker-desktop/cli-tools/usr/bin/docker). See setup.md."
            )
        elif (
            result.returncode != 0
            and (
                "failed to connect to the docker api" in combined_out
                or "dockerdesktoplinuxengine" in combined_out
                or "cannot connect to the docker daemon" in combined_out
            )
        ):
            self.log.error(
                "Docker engine is not reachable (daemon not running or wrong mode). "
                "Start Docker Desktop from Windows and wait until it is fully up; "
                "use Linux containers; then retry. From WSL, `docker.exe version` "
                "should show a Server section, not only Client. See setup.md."
            )

        # ZAP baseline returns non-zero whenever it finds anything,
        # so we don't fail on rc != 0 -- we only fail when no JSON
        # was produced.
        if not report_json.exists():
            self.log.warning(
                "ZAP did not produce a JSON report; nothing to parse. "
                "Check raw/zap/zap.run.log for the underlying tool error."
            )
            return None, []

        try:
            data = json.loads(report_json.read_text(encoding="utf-8", errors="replace"))
        except (OSError, json.JSONDecodeError) as exc:
            self.log.error("Could not parse ZAP report %s: %s", report_json, exc)
            return report_json, []

        findings = list(self._extract_findings(data))
        self.log.info("ZAP produced %d finding(s).", len(findings))
        return report_json, findings

    # ------------------------------------------------------------------
    # Command construction
    # ------------------------------------------------------------------

    def _build_command(self, report_json: Path) -> List[str]:
        target = root_url(self.ctx.target_url)
        mode = self._zap_mode()

        # 1) Native install always wins when available.
        native_bins = _NATIVE_FULL_BINARIES if mode == "full" else _NATIVE_BINARIES
        for binary in native_bins:
            if which(binary):
                cmd = [binary, "-t", target, "-J", str(report_json)]
                if mode == "ajax" and binary == "zap-baseline.py":
                    cmd.append("-j")
                return cmd

        # 2) Docker fallback (uses utils.runner.docker_cli — avoids Docker Desktop stub).
        if self.ctx.extras.get("zap_use_docker") and docker_cli():
            return self._build_docker_command(target, report_json)

        return []

    def _build_docker_command(self, target: str, report_json: Path) -> List[str]:
        docker_bin = docker_cli()
        if not docker_bin:
            return []

        host_dir = report_json.parent.resolve()
        mount = f"{host_dir}:/zap/wrk:rw"

        target_container = self.ctx.extras.get("zap_docker_target_container")
        net_pref = self.ctx.extras.get("zap_docker_network")
        network_name: Optional[str] = None
        effective_target = target

        # Attempt container-to-container networking when we have any
        # information at all about a target container or an "auto"
        # network preference.
        if target_container:
            inferred_net, inferred_url = self._prepare_container_network(
                docker_bin,
                target_container,
                target,
                requested_network=net_pref,
            )
            if inferred_net and inferred_url:
                network_name = inferred_net
                effective_target = inferred_url
        elif isinstance(net_pref, str) and net_pref.lower() == "auto":
            self.log.info(
                "zap_docker_network='auto' but no zap_docker_target_container set; "
                "skipping auto-detection."
            )
        elif isinstance(net_pref, str) and net_pref:
            network_name = net_pref

        cmd: List[str] = [docker_bin, "run", "--rm"]
        if network_name:
            cmd += ["--network", network_name]
            self.log.info("ZAP container will join Docker network: %s", network_name)
        else:
            # Original fallback - works on most Docker Desktop installs.
            cmd += ["--add-host=host.docker.internal:host-gateway"]

        cmd += [
            "-v", mount,
            "zaproxy/zap-stable",
            "zap-full-scan.py" if self._zap_mode() == "full" else "zap-baseline.py",
            "-t", effective_target,
            "-J", report_json.name,
        ]
        if self._zap_mode() == "ajax":
            cmd.append("-j")

        if effective_target != target:
            self.log.info(
                "ZAP target rewritten for Docker network: %s -> %s",
                target,
                effective_target,
            )
        return cmd

    def _zap_mode(self) -> str:
        mode = str(self.ctx.extras.get("zap_mode") or "baseline").strip().lower()
        return mode if mode in {"baseline", "ajax", "full"} else "baseline"

    # ------------------------------------------------------------------
    # Container-to-container networking helpers
    # ------------------------------------------------------------------

    def _prepare_container_network(
        self,
        docker_bin: str,
        target_container: str,
        original_target: str,
        requested_network: Optional[str] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        """Inspect ``target_container`` and prepare a usable Docker network.

        Returns a ``(network_name, container_target_url)`` tuple where
        ``container_target_url`` is the URL the ZAP container should
        actually request (e.g. ``http://target-container:3000``).

        Returns ``(None, None)`` if anything goes wrong - the caller
        will then fall back to ``host-gateway`` mode.
        """

        info = self._inspect_container(docker_bin, target_container)
        if info is None:
            self.log.warning(
                "Container %r not found; cannot use container-network mode for ZAP.",
                target_container,
            )
            return None, None

        # Choose a usable network. Default Docker bridge does not allow
        # name resolution, so we always upgrade to a user-defined network.
        target_networks = info.get("networks") or []
        chosen_network: Optional[str] = None

        if isinstance(requested_network, str) and requested_network.strip().lower() not in {"auto", ""}:
            chosen_network = requested_network.strip()
            if chosen_network not in target_networks:
                if not self._connect_to_network(docker_bin, target_container, chosen_network):
                    return None, None
        else:
            non_default = [n for n in target_networks if n != "bridge"]
            if non_default:
                chosen_network = non_default[0]
            else:
                chosen_network = _AUTO_NETWORK_NAME
                if not self._ensure_network_exists(docker_bin, chosen_network):
                    return None, None
                if chosen_network not in target_networks:
                    if not self._connect_to_network(docker_bin, target_container, chosen_network):
                        return None, None

        port = self._extract_target_port(info, original_target)
        scheme = urlparse(original_target).scheme or "http"
        return chosen_network, f"{scheme}://{target_container}:{port}/"

    def _inspect_container(self, docker_bin: str, name: str) -> Optional[dict]:
        result = run_command(
            [docker_bin, "inspect", name],
            timeout=30,
            log_path=self.raw_path(f"docker_inspect_{_safe(name)}.log"),
        )
        if not result.ok:
            return None
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            return None
        if not data:
            return None
        first = data[0]
        networks_block = (first.get("NetworkSettings") or {}).get("Networks") or {}
        networks = list(networks_block.keys())
        exposed = (first.get("Config") or {}).get("ExposedPorts") or {}
        ports = list(exposed.keys())
        return {
            "raw": first,
            "networks": networks,
            "exposed_ports": ports,
        }

    def _ensure_network_exists(self, docker_bin: str, network: str) -> bool:
        result = run_command(
            [docker_bin, "network", "inspect", network],
            timeout=30,
            log_path=self.raw_path(f"docker_net_inspect_{_safe(network)}.log"),
        )
        if result.ok:
            return True
        create = run_command(
            [docker_bin, "network", "create", network],
            timeout=30,
            log_path=self.raw_path(f"docker_net_create_{_safe(network)}.log"),
        )
        if create.ok:
            self.log.info("Created Docker network %s", network)
            return True
        self.log.error(
            "Could not create Docker network %s (rc=%d, stderr=%s).",
            network,
            create.returncode,
            (create.stderr or "").strip().splitlines()[-1] if create.stderr else "",
        )
        return False

    def _connect_to_network(self, docker_bin: str, container: str, network: str) -> bool:
        result = run_command(
            [docker_bin, "network", "connect", network, container],
            timeout=30,
            log_path=self.raw_path(f"docker_net_connect_{_safe(network)}_{_safe(container)}.log"),
        )
        if result.ok:
            self.log.info("Connected %s to network %s", container, network)
            return True
        # If it was already connected, "connect" returns non-zero with a
        # specific message - that's actually fine for us.
        stderr = (result.stderr or "").lower()
        if "already exists" in stderr or "endpoint with name" in stderr:
            self.log.debug("%s already on %s; continuing.", container, network)
            return True
        self.log.error(
            "Could not connect %s to network %s: %s",
            container,
            network,
            stderr.strip(),
        )
        return False

    def _extract_target_port(self, info: dict, original_target: str) -> int:
        """Pick the most likely internal port the target listens on."""

        url_port = urlparse(original_target).port
        if url_port:
            return int(url_port)
        for port_spec in info.get("exposed_ports") or []:
            match = re.match(r"(\d+)/(?:tcp|udp)?", port_spec)
            if match:
                return int(match.group(1))
        return 80

    # ------------------------------------------------------------------
    # ZAP report parsing
    # ------------------------------------------------------------------

    def _extract_findings(self, data: dict) -> List[Finding]:
        findings: List[Finding] = []
        for site in data.get("site", []) or []:
            for alert in site.get("alerts", []) or []:
                name = alert.get("name") or alert.get("alert") or "ZAP Alert"
                severity = normalize_severity(alert.get("riskdesc") or alert.get("risk"))
                base_description = (
                    alert.get("desc")
                    or alert.get("description")
                    or "Reported by OWASP ZAP."
                )
                solution = alert.get("solution") or ""
                cwe = alert.get("cweid") or alert.get("cwe")
                instances = alert.get("instances") or []
                if not instances:
                    instances = [{"uri": site.get("@name") or self.ctx.target_url}]
                for inst in instances:
                    description_parts = [_strip_html(base_description)]
                    if cwe and cwe not in {"-1", -1}:
                        description_parts.append(f"CWE-{cwe}")
                    if solution:
                        description_parts.append("Solution: " + _strip_html(solution))
                    if inst.get("evidence"):
                        description_parts.append("Evidence: " + str(inst["evidence"])[:200])
                    findings.append(
                        self.make_finding(
                            type_=name,
                            severity=severity,
                            endpoint=_normalize_endpoint(
                                inst.get("uri") or self.ctx.target_url,
                                self.ctx.target_url,
                            ),
                            description=" | ".join(p for p in description_parts if p),
                        )
                    )
        return findings


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name)


def _strip_html(text: str) -> str:
    """Tiny HTML tag stripper - ZAP descriptions sometimes include <p>/<br>."""

    if not text:
        return ""
    out: List[str] = []
    in_tag = False
    for char in text:
        if char == "<":
            in_tag = True
            continue
        if char == ">":
            in_tag = False
            continue
        if not in_tag:
            out.append(char)
    return " ".join("".join(out).split())


def _normalize_endpoint(reported: str, original_target: str) -> str:
    """Rewrite container-name URLs back to the user-facing host.

    When ZAP runs on a Docker network, alerts come back with the
    container hostname (``http://target-container:3000/...``). Reports are
    easier to read if we rewrite that to the host the user actually
    typed (``http://localhost:3000/...``).
    """

    if not reported:
        return original_target
    try:
        rep = urlparse(reported)
        orig = urlparse(original_target)
    except ValueError:
        return reported
    if not rep.netloc or not orig.netloc:
        return reported
    if rep.netloc == orig.netloc:
        return reported
    rebuilt = urlunparse(
        (orig.scheme or rep.scheme, orig.netloc, rep.path, rep.params, rep.query, rep.fragment)
    )
    return rebuilt
