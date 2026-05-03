"""De-duplicate findings produced by multiple scanners.

Two findings are considered duplicates when they share the same tuple of
``(type, endpoint without trailing slash, severity)``. The first one
wins; subsequent occurrences contribute to ``also_reported_by`` so the
report can show that several tools flagged the same issue.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

from .parser import normalize_severity


_DedupeKey = Tuple[str, str, str]


def _key(finding: dict) -> _DedupeKey:
    type_ = (finding.get("type") or "").strip().lower()
    endpoint = (finding.get("endpoint") or "").strip().rstrip("/")
    severity = normalize_severity(finding.get("severity"))
    return type_, endpoint, severity


def dedupe_findings(findings: List[dict]) -> List[dict]:
    """Return a de-duplicated list, preserving order of first occurrence.

    The returned dicts are *new* shallow copies with an extra
    ``also_reported_by`` list that names every additional tool which
    reported the same issue.
    """

    seen: Dict[_DedupeKey, dict] = {}
    order: List[_DedupeKey] = []

    for finding in findings:
        key = _key(finding)
        canonical = dict(finding)
        canonical["severity"] = normalize_severity(canonical.get("severity"))
        if key not in seen:
            canonical.setdefault("also_reported_by", [])
            seen[key] = canonical
            order.append(key)
            continue

        existing = seen[key]
        tool = canonical.get("tool")
        if tool and tool != existing.get("tool"):
            others = existing.setdefault("also_reported_by", [])
            if tool not in others:
                others.append(tool)
        # Prefer the longest description we have seen.
        if len(canonical.get("description") or "") > len(existing.get("description") or ""):
            existing["description"] = canonical["description"]
        for field in (
            "evidence",
            "impact",
            "remediation",
            "owasp",
            "phase",
            "validation_kind",
            "achieved",
        ):
            if not existing.get(field) and canonical.get(field):
                existing[field] = canonical[field]
        if canonical.get("exploit_attempted"):
            existing["exploit_attempted"] = True
        if canonical.get("artifact_paths"):
            paths = existing.setdefault("artifact_paths", [])
            for path in canonical["artifact_paths"]:
                if path not in paths:
                    paths.append(path)
        if canonical.get("validated"):
            existing["validated"] = True
        existing_conf = str(existing.get("confidence") or "low").lower()
        new_conf = str(canonical.get("confidence") or "low").lower()
        rank = {"low": 0, "medium": 1, "high": 2, "confirmed": 3}
        if rank.get(new_conf, 1) > rank.get(existing_conf, 1):
            existing["confidence"] = canonical["confidence"]
        if canonical.get("reproduction"):
            steps = existing.setdefault("reproduction", [])
            for step in canonical["reproduction"]:
                if step not in steps:
                    steps.append(step)

    return [seen[k] for k in order]
