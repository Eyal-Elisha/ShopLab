"""Common base class for every scanner wrapper.

Each concrete scanner defines:

* ``name``    - the canonical tool name shown in reports.
* ``binary``  - the executable looked up via :func:`shutil.which`.
* ``run(...)``- the per-tool implementation.

The base class handles availability checks, the per-run output
directory layout and the helper that builds findings in the unified
schema required by ``utils.report_generator``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple, TypedDict

from utils.logger import get_logger
from utils.parser import normalize_severity
from utils.runner import which


class Finding(TypedDict, total=False):
    """The unified finding schema used across the orchestrator."""

    tool: str
    type: str
    severity: str
    endpoint: str
    description: str
    owasp: str
    confidence: str
    evidence: str
    reproduction: List[str]
    impact: str
    remediation: str
    validated: bool
    also_reported_by: List[str]
    phase: str
    validation_kind: str
    exploit_attempted: bool
    achieved: str
    artifact_paths: List[str]


@dataclass
class ScanContext:
    """Shared state passed into every scanner.

    Attributes
    ----------
    target_url:
        The original URL supplied on the command line.
    run_dir:
        Top-level directory for all artefacts produced by this run.
    raw_dir:
        Sub-directory that scanners use for raw tool output.
    timeout:
        Per-tool wall-clock cap, in seconds.
    extras:
        Free-form bag for cross-scanner state (currently used to share
        the discovered-endpoint list from dirb).
    """

    target_url: str
    run_dir: Path
    raw_dir: Path
    timeout: int = 600
    extras: dict = field(default_factory=dict)


class BaseScanner:
    """Template-method base for every concrete scanner."""

    name: str = "base"
    binary: str = ""

    def __init__(self, ctx: ScanContext) -> None:
        self.ctx = ctx
        self.log = get_logger(self.name)

    def is_available(self) -> bool:
        """Return ``True`` when this scanner's binary is on ``$PATH``."""

        if not self.binary:
            return False
        return which(self.binary) is not None

    def raw_path(self, filename: str) -> Path:
        """Return ``raw_dir/<scanner>/<filename>`` and ensure the dir exists."""

        scanner_dir = self.ctx.raw_dir / self.name
        scanner_dir.mkdir(parents=True, exist_ok=True)
        return scanner_dir / filename

    def make_finding(
        self,
        *,
        type_: str,
        severity: str,
        endpoint: str,
        description: str,
        owasp: str = "",
        confidence: str = "medium",
        evidence: str = "",
        reproduction: Optional[List[str]] = None,
        impact: str = "",
        remediation: str = "",
        validated: bool = False,
        phase: str = "",
        validation_kind: str = "",
        exploit_attempted: bool = False,
        achieved: str = "",
        artifact_paths: Optional[List[str]] = None,
    ) -> Finding:
        """Build a finding dict in the unified schema."""

        finding: Finding = {
            "tool": self.name,
            "type": type_.strip(),
            "severity": normalize_severity(severity),
            "endpoint": endpoint.strip(),
            "description": description.strip(),
            "confidence": confidence.strip().lower() or "medium",
            "validated": bool(validated),
        }
        if owasp:
            finding["owasp"] = owasp.strip()
        if evidence:
            finding["evidence"] = evidence.strip()
        if reproduction:
            finding["reproduction"] = [step.strip() for step in reproduction if step.strip()]
        if impact:
            finding["impact"] = impact.strip()
        if remediation:
            finding["remediation"] = remediation.strip()
        if phase:
            finding["phase"] = phase.strip()
        if validation_kind:
            finding["validation_kind"] = validation_kind.strip()
        if exploit_attempted:
            finding["exploit_attempted"] = True
        if achieved:
            finding["achieved"] = achieved.strip()
        if artifact_paths:
            finding["artifact_paths"] = [str(p).strip() for p in artifact_paths if str(p).strip()]
        return finding

    def execute(self) -> Tuple[Optional[Path], List[Finding]]:
        """Run the scanner if available, otherwise log and skip."""

        if not self.is_available():
            self.log.warning(
                "%s not found in PATH - skipping. See setup.md for install instructions.",
                self.binary or self.name,
            )
            return None, []

        self.log.info("Running %s against %s", self.name, self.ctx.target_url)
        try:
            return self.run()
        except Exception as exc:
            self.log.exception("Unhandled error in %s scanner: %s", self.name, exc)
            return None, []

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        """Concrete scanners override this to do the actual work."""

        raise NotImplementedError
