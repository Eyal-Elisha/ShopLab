"""Wrapper around ``sqlmap``.

Only endpoints that carry a query string are tested. For each candidate
URL ``sqlmap`` is invoked with low risk/level and ``--batch`` so the
tool never asks interactive questions. Findings are extracted from
sqlmap's combined stdout/stderr output using the regex helper in
:mod:`utils.parser`.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urlparse

from utils.parser import has_query_string, parse_sqlmap_log
from utils.runner import run_command

from .base import BaseScanner, Finding


_MAX_TARGETS_DEFAULT = 10


class SqlmapScanner(BaseScanner):
    name = "sqlmap"
    binary = "sqlmap"

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        endpoints = self.ctx.extras.get("endpoints") or [self.ctx.target_url]
        candidates = [u for u in endpoints if has_query_string(u)]

        if not candidates:
            self.log.info("No URLs with query strings to feed sqlmap; skipping.")
            return None, []

        max_targets = int(self.ctx.extras.get("sqlmap_max_targets", _MAX_TARGETS_DEFAULT))
        if len(candidates) > max_targets:
            self.log.warning(
                "Limiting sqlmap to first %d of %d candidate URLs (use extras['sqlmap_max_targets'] to raise).",
                max_targets,
                len(candidates),
            )
            candidates = candidates[:max_targets]

        scanner_dir = self.ctx.raw_dir / self.name
        scanner_dir.mkdir(parents=True, exist_ok=True)
        output_dir = scanner_dir / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        all_findings: List[Finding] = []
        last_log: Optional[Path] = None

        for idx, url in enumerate(candidates, start=1):
            slug = _slug_for_url(url, idx)
            tool_log = scanner_dir / f"sqlmap_{slug}.log"
            self.log.info("[%d/%d] sqlmap -> %s", idx, len(candidates), url)

            cmd = [
                self.binary,
                "-u", url,
                "--batch",
                "--level", "1",
                "--risk", "1",
                "--flush-session",
                "--disable-coloring",
                "--output-dir", str(output_dir),
            ]
            result = run_command(
                cmd,
                timeout=self.ctx.timeout,
                log_path=tool_log,
            )
            last_log = tool_log if tool_log.exists() else last_log

            if result.not_found:
                return None, all_findings

            combined = (result.stdout or "") + "\n" + (result.stderr or "")
            findings = list(self._parse_findings(combined, url))
            self.log.info("    -> %d sqlmap finding(s)", len(findings))
            all_findings.extend(findings)

        return last_log, all_findings

    def _parse_findings(self, text: str, url: str) -> List[Finding]:
        findings: List[Finding] = []
        for param, technique, title in parse_sqlmap_log(text):
            description = (
                f"Parameter `{param}` is vulnerable. Technique: {technique}. "
                f"Title: {title}."
            )
            findings.append(
                self.make_finding(
                    type_="SQL Injection",
                    severity="high",
                    endpoint=url,
                    description=description,
                    confidence="high",
                    evidence=f"parameter={param}; technique={technique}; title={title}",
                    remediation="Use parameterized queries and server-side allowlists for dynamic clauses.",
                    phase="validation",
                    validation_kind="exploit",
                    exploit_attempted=True,
                    achieved="SQL injection confirmed by sqlmap",
                    artifact_paths=[str(self.raw_path("output"))],
                    validated=True,
                )
            )
        if not findings and re.search(r"is\s+not\s+injectable", text, re.IGNORECASE):
            self.log.debug("sqlmap reports %s as not injectable.", url)
        return findings


def _slug_for_url(url: str, idx: int) -> str:
    parsed = urlparse(url)
    base = (parsed.netloc + parsed.path).strip("/").replace("/", "_")
    base = re.sub(r"[^A-Za-z0-9_.-]+", "_", base) or "target"
    return f"{idx:02d}_{base[:60]}"
