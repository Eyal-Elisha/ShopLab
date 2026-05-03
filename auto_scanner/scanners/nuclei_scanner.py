"""Wrapper around ``nuclei`` from ProjectDiscovery.

Nuclei is run with ``-jsonl`` so each finding is a self-contained JSON
object that we can map directly onto our unified schema.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urlparse

from utils.runner import run_command

from .base import BaseScanner, Finding


class NucleiScanner(BaseScanner):
    name = "nuclei"
    binary = "nuclei"

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        endpoints = _prioritize_urls(
            self.ctx.extras.get("endpoints") or [self.ctx.target_url],
            int(self.ctx.extras.get("nuclei_max_urls", 15)),
        )
        if not endpoints:
            self.log.warning("No endpoints to feed nuclei; skipping.")
            return None, []

        urls_file = self.raw_path("urls.txt")
        urls_file.write_text("\n".join(endpoints) + "\n", encoding="utf-8")

        jsonl_out = self.raw_path("nuclei.jsonl")
        if jsonl_out.exists():
            jsonl_out.unlink()

        cmd = [
            self.binary,
            "-l", str(urls_file),
            "-jsonl",
            "-o", str(jsonl_out),
            "-severity", "info,low,medium,high,critical",
            "-silent",
            "-disable-update-check",
            "-no-color",
        ]
        tags = self.ctx.extras.get("nuclei_tags")
        if tags:
            cmd += ["-tags", str(tags)]
            self.log.info("nuclei tag filter: %s", tags)
        rate = self.ctx.extras.get("nuclei_rate_limit")
        if rate:
            cmd += ["-rate-limit", str(rate)]
        concurrency = self.ctx.extras.get("nuclei_concurrency")
        if concurrency:
            cmd += ["-c", str(concurrency)]
        result = run_command(
            cmd,
            timeout=self.ctx.timeout,
            log_path=self.raw_path("nuclei.run.log"),
        )

        if result.not_found:
            return None, []

        if not jsonl_out.exists():
            self.log.info("nuclei produced no findings.")
            return None, []

        findings: List[Finding] = []
        try:
            with jsonl_out.open("r", encoding="utf-8", errors="replace") as fh:
                for line_no, raw in enumerate(fh, start=1):
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        record = json.loads(raw)
                    except json.JSONDecodeError as exc:
                        self.log.debug("Skipping malformed nuclei line %d: %s", line_no, exc)
                        continue
                    findings.append(self._record_to_finding(record))
        except OSError as exc:
            self.log.error("Could not read nuclei output %s: %s", jsonl_out, exc)
            return jsonl_out, findings

        self.log.info("nuclei produced %d finding(s).", len(findings))
        return jsonl_out, findings

    def _record_to_finding(self, record: dict) -> Finding:
        info = record.get("info") or {}
        template_id = record.get("template-id") or record.get("templateID") or "unknown"
        type_ = info.get("name") or template_id
        severity = info.get("severity") or "info"
        endpoint = (
            record.get("matched-at")
            or record.get("matched")
            or record.get("host")
            or self.ctx.target_url
        )

        description_parts = []
        if info.get("description"):
            description_parts.append(str(info["description"]).strip())
        if record.get("matcher-name"):
            description_parts.append(f"Matcher: {record['matcher-name']}")
        if info.get("tags"):
            tags = info["tags"]
            if isinstance(tags, list):
                tags = ", ".join(str(t) for t in tags)
            description_parts.append(f"Tags: {tags}")
        description_parts.append(f"Template: {template_id}")
        description = " | ".join(description_parts)

        return self.make_finding(
            type_=type_,
            severity=severity,
            endpoint=endpoint,
            description=description,
        )


def _prioritize_urls(urls: List[str], limit: int) -> List[str]:
    weighted = []
    for idx, url in enumerate(dict.fromkeys(urls)):
        path = urlparse(str(url)).path.lower()
        score = 0
        if path in {"", "/"}:
            score += 100
        if any(mark in path for mark in ("admin", "debug", "api", "login", "auth", "upload", "backup")):
            score += 30
        if "{" in path or ":" in path or "*" in path:
            score -= 20
        weighted.append((-score, idx, str(url)))
    return [url for _score, _idx, url in sorted(weighted)[: max(1, limit)]]
