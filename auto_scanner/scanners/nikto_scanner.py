"""Wrapper around the ``nikto`` web server scanner.

Nikto is a long-standing CGI/HTTP weakness scanner that complements
ZAP's passive baseline well. It checks for well-known dangerous files,
out-of-date servers, default credentials, server misconfigurations and
hundreds of other low-hanging issues.

Some distro builds of nikto do not support JSON output. The wrapper therefore
uses portable text output and parses nikto's ``+ ...`` finding lines.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Optional, Tuple

from utils.parser import normalize_severity
from utils.runner import run_command, which

from .base import BaseScanner, Finding


_DEFAULT_NIKTO_BINARIES = ("nikto", "nikto.pl")


class NiktoScanner(BaseScanner):
    name = "nikto"
    binary = "nikto"

    def is_available(self) -> bool:
        return any(which(b) is not None for b in _DEFAULT_NIKTO_BINARIES)

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        binary = next((b for b in _DEFAULT_NIKTO_BINARIES if which(b)), self.binary)
        report_txt = self.raw_path("nikto.txt")
        if report_txt.exists():
            report_txt.unlink()

        target = self.ctx.target_url

        cmd: List[str] = [
            binary,
            "-h", target,
            "-Format", "txt",
            "-output", str(report_txt),
            "-ask", "no",
            "-nointeractive",
            "-Tuning", "1234567890abc",
        ]
        extra_args = self.ctx.extras.get("nikto_args") or []
        if isinstance(extra_args, list):
            cmd.extend(str(a) for a in extra_args)

        result = run_command(
            cmd,
            timeout=max(self.ctx.timeout, 1200),
            log_path=self.raw_path("nikto.run.log"),
        )

        if result.not_found:
            return None, []

        if not report_txt.exists():
            self.log.warning(
                "nikto produced no text report (rc=%d). Check raw/nikto/nikto.run.log.",
                result.returncode,
            )
            return None, []

        try:
            text = report_txt.read_text(encoding="utf-8", errors="replace").strip()
        except OSError as exc:
            self.log.error("Could not read nikto report %s: %s", report_txt, exc)
            return report_txt, []

        if not text:
            self.log.info("nikto text report is empty.")
            return report_txt, []

        findings = list(self._extract_findings(text))
        self.log.info("nikto produced %d finding(s).", len(findings))
        return report_txt, findings

    def _extract_findings(self, text: str) -> Iterable[Finding]:
        for raw in text.splitlines():
            line = raw.strip()
            if not line.startswith("+ "):
                continue
            msg = line[2:].strip()
            if not msg or msg.lower().startswith(("target ", "start time", "end time", "1 host")):
                continue
            endpoint = _endpoint_from_message(msg, self.ctx.target_url)
            yield self.make_finding(
                type_=_short_type(msg),
                severity=_severity_for(msg),
                endpoint=endpoint,
                description=msg,
            )


def _severity_for(msg: str) -> str:
    """Heuristic severity from nikto's free-form message."""

    if not msg:
        return "info"
    lowered = msg.lower()
    if any(t in lowered for t in (
        "sql injection", "remote code", "command injection", "rce ",
        "directory traversal", "default account", "default password",
    )):
        return "high"
    if any(t in lowered for t in (
        "xss", "cross-site", "csrf", "authentication", "authorization",
        "info disclosure", "information disclosure",
    )):
        return "medium"
    if any(t in lowered for t in (
        "header", "cookie", "options", "trace", "outdated", "deprecated",
    )):
        return "low"
    return normalize_severity("info")


def _short_type(msg: str) -> str:
    """Take the first sentence of the nikto message as the finding type."""

    if not msg:
        return "Nikto Finding"
    first = msg.split(".", 1)[0].strip()
    if len(first) > 90:
        first = first[:87] + "..."
    return first or "Nikto Finding"


def _endpoint_from_message(msg: str, fallback: str) -> str:
    for token in msg.split():
        if token.startswith(("http://", "https://")):
            return token.rstrip(".,)")
        if token.startswith("/") and not token.startswith("//"):
            return fallback.rstrip("/") + token.rstrip(".,)")
    return fallback
