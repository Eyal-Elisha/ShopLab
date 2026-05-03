"""Wrapper around the ``dirb`` web content discovery tool.

Dirb is invoked first because the URLs it discovers feed both
:mod:`scanners.sqlmap_scanner` and :mod:`scanners.nuclei_scanner`. The
discovered URL list is also stored back on
:attr:`base.ScanContext.extras` so the orchestrator can persist it as
``endpoints.json``.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

from utils.parser import parse_dirb_output, root_url
from utils.runner import run_command

from .base import BaseScanner, Finding


class DirbScanner(BaseScanner):
    name = "dirb"
    binary = "dirb"

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        raw_log = self.raw_path("dirb.txt")
        target = root_url(self.ctx.target_url)

        cmd: List[str] = [self.binary, target]
        wordlist = self.ctx.extras.get("dirb_wordlist")
        if wordlist:
            wl_path = Path(str(wordlist)).expanduser()
            if wl_path.is_file():
                cmd.append(str(wl_path))
                self.log.info("dirb wordlist: %s", wl_path)
            else:
                self.log.warning(
                    "dirb wordlist %s not found - falling back to dirb default.",
                    wl_path,
                )
        cmd += ["-S", "-o", str(raw_log)]
        result = run_command(
            cmd,
            timeout=self.ctx.timeout,
            log_path=self.raw_path("dirb.run.log"),
        )

        if result.not_found:
            return None, []

        text = ""
        if raw_log.exists():
            try:
                text = raw_log.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                self.log.error("Could not read dirb output %s: %s", raw_log, exc)
        if not text:
            text = result.stdout

        urls = parse_dirb_output(text)
        self.log.info("dirb discovered %d endpoint(s)", len(urls))

        existing = self.ctx.extras.get("endpoints", [])
        merged = list(dict.fromkeys([*existing, self.ctx.target_url, *urls]))
        self.ctx.extras["endpoints"] = merged

        findings: List[Finding] = []
        for url in urls:
            findings.append(
                self.make_finding(
                    type_="Exposed Path",
                    severity="info",
                    endpoint=url,
                    description=(
                        "Path discovered by dirb brute-force enumeration. "
                        "Review whether it should be publicly reachable."
                    ),
                )
            )

        return raw_log if raw_log.exists() else None, findings
