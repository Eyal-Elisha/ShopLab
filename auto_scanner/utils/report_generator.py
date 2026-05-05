"""Build the unified JSON and HTML reports.

The HTML report uses :mod:`string.Template` so we have no third-party
dependency. The template lives at ``templates/report.html.tmpl``.
"""

from __future__ import annotations

import datetime as _dt
import html
import json
from collections import Counter, defaultdict
from pathlib import Path
from string import Template
from typing import Dict, Iterable, List, Optional

from .owasp_taxonomy import ALL_FAMILIES, codes_for, lookup
from .parser import VALID_SEVERITIES, severity_rank
from .secret_harvest import detect_flag


_VERSION = "1.0.0"


def write_json(findings: List[dict], path: Path, meta: Optional[dict] = None) -> Path:
    """Write the unified JSON report and return its path."""

    payload = {
        "meta": meta or {},
        "summary": _summarise(findings),
        "findings": findings,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=False), encoding="utf-8")
    return path


def write_html(
    findings: List[dict],
    path: Path,
    meta: Optional[dict] = None,
    template_path: Optional[Path] = None,
) -> Path:
    """Render the HTML report and return its path."""

    meta = meta or {}
    template_path = template_path or (
        Path(__file__).resolve().parent.parent / "templates" / "report.html.tmpl"
    )
    template = Template(template_path.read_text(encoding="utf-8"))

    summary = _summarise(findings)
    executive_summary = _render_executive_summary(findings, meta, summary)
    discovery_summary = _render_discovery_summary(meta)
    sev_cards = _render_severity_cards(summary["by_severity"], summary["total"])
    tool_table = _render_tool_table(summary["by_tool"])
    owasp_table = _render_owasp_table(summary["by_owasp"])
    section_table = _render_section_table(summary["by_section"])
    coverage_matrix_html = _render_coverage_matrix(summary["coverage"])
    findings_html = _render_findings(findings)

    rendered = template.safe_substitute(
        target=html.escape(str(meta.get("target", ""))),
        run_id=html.escape(str(meta.get("run_id", ""))),
        generated_at=html.escape(
            meta.get("generated_at")
            or _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ),
        total_findings=str(summary["total"]),
        executive_summary=executive_summary,
        discovery_summary=discovery_summary,
        severity_cards=sev_cards,
        tool_table=tool_table,
        owasp_table=owasp_table,
        section_table=section_table,
        coverage_matrix=coverage_matrix_html,
        findings_html=findings_html,
        version=_VERSION,
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered, encoding="utf-8")
    return path


def write_reports(
    findings: List[dict],
    run_dir: Path,
    meta: Optional[dict] = None,
) -> dict:
    """Convenience helper that writes both the JSON and HTML reports."""

    json_path = run_dir / "report.json"
    html_path = run_dir / "report.html"
    write_json(findings, json_path, meta=meta)
    write_html(findings, html_path, meta=meta)
    return {"json": json_path, "html": html_path}


def _summarise(findings: Iterable[dict]) -> dict:
    by_sev: Counter = Counter()
    by_tool: Counter = Counter()
    by_owasp: Counter = Counter()
    by_section: Counter = Counter()
    coverage: Dict[str, Counter] = {family: Counter() for family, _ in ALL_FAMILIES}
    validated = 0
    flags = set()
    finding_list = list(findings)
    for f in finding_list:
        by_sev[f.get("severity", "info")] += 1
        by_tool[f.get("tool", "unknown")] += 1
        section = _finding_section(f)
        by_section[section] += 1
        f.setdefault("section", section)
        owasp = f.get("owasp")
        if owasp:
            by_owasp[owasp] += 1
            if section in {"Flag Captures", "Confirmed Exploits", "Validated Vulnerabilities"}:
                for code in codes_for(str(owasp)):
                    family = _family_of(code)
                    if family:
                        coverage[family][code] += 1
        if f.get("validated"):
            validated += 1
        flag = _finding_flag(f)
        if flag:
            flags.add(flag)
    return {
        "total": sum(by_sev.values()),
        "by_severity": dict(by_sev),
        "by_tool": dict(by_tool),
        "by_owasp": dict(by_owasp),
        "by_section": dict(by_section),
        "coverage": {family: dict(counter) for family, counter in coverage.items()},
        "validated": validated,
        "flags_captured": len(flags),
    }


def _family_of(code: str) -> Optional[str]:
    for family_name, mapping in ALL_FAMILIES:
        if code in mapping:
            return family_name
    return None


def _render_severity_cards(by_severity: dict, total: int) -> str:
    rows = []
    rows.append(_severity_card("total", total))
    for sev in reversed(VALID_SEVERITIES):  # critical -> info
        rows.append(_severity_card(sev, by_severity.get(sev, 0)))
    return "\n      ".join(rows)


def _severity_card(label: str, count: int) -> str:
    cls = label if label in VALID_SEVERITIES else "info"
    pretty = "Total" if label == "total" else label.capitalize()
    return (
        f'<div class="card"><div class="num">{count}</div>'
        f'<div class="label"><span class="pill {cls}">{html.escape(pretty)}</span></div></div>'
    )


def _render_executive_summary(findings: List[dict], meta: dict, summary: dict) -> str:
    achievements = [f for f in findings if f.get("achieved")]
    attempted = sum(1 for f in findings if f.get("exploit_attempted"))
    surface = meta.get("surface_model") if isinstance(meta.get("surface_model"), dict) else {}
    attack_plan = meta.get("attack_plan") if isinstance(meta.get("attack_plan"), dict) else {}
    cards = [
        ("Endpoints", len(surface.get("endpoints") or [])),
        ("API endpoints", len(surface.get("api_endpoints") or [])),
        ("Exploit attempts", attempted),
        ("Exploited weaknesses", len(achievements)),
    ]
    card_html = "\n      ".join(
        f'<div class="card"><div class="num">{count}</div><div class="label">{html.escape(label)}</div></div>'
        for label, count in cards
    )
    planned = ", ".join(attack_plan.get("validation_scanners") or []) or "(none)"
    skipped = attack_plan.get("skipped") or {}
    skipped_line = (
        "<br />"
        f"<strong>Skipped validation:</strong> {html.escape(', '.join(f'{k}: {v}' for k, v in skipped.items()))}"
        if skipped
        else ""
    )
    return (
        f'<div class="cards">{card_html}</div>'
        f'<p class="muted"><strong>Validation tools scheduled:</strong> {html.escape(planned)}'
        f"{skipped_line}</p>"
    )


def _render_discovery_summary(meta: dict) -> str:
    surface = meta.get("surface_model") if isinstance(meta.get("surface_model"), dict) else {}
    if not surface:
        return '<div class="empty">No surface model was recorded.</div>'
    rows = [
        ("Target root", surface.get("root", "")),
        ("HTTPS", "yes" if surface.get("is_https") else "no"),
        ("Private/local target", "yes" if surface.get("is_private_or_local") else "no"),
        ("WordPress detected", "yes" if surface.get("wordpress_detected") else "no"),
        ("Candidate attacks", ", ".join(surface.get("candidate_attacks") or []) or "(none)"),
        ("Technologies", ", ".join(surface.get("technologies") or []) or "(none)"),
    ]
    body = "".join(
        f"<tr><td>{html.escape(label)}</td><td>{html.escape(str(value))}</td></tr>"
        for label, value in rows
    )
    examples = surface.get("api_endpoints") or surface.get("endpoints") or []
    if examples and isinstance(examples[0], dict):
        example_vals = [str(e.get("url", "")) for e in examples[:8]]
    else:
        example_vals = [str(e) for e in examples[:8]]
    example_html = (
        "<p class=\"muted\"><strong>Top examples:</strong> "
        + html.escape(", ".join(v for v in example_vals if v))
        + "</p>"
        if example_vals
        else ""
    )
    return (
        "<table><thead><tr><th>Observation</th><th>Value</th></tr></thead>"
        f"<tbody>{body}</tbody></table>{example_html}"
    )


def _render_tool_table(by_tool: dict) -> str:
    if not by_tool:
        return '<div class="empty">No scanners produced findings.</div>'
    rows = "".join(
        f"<tr><td>{html.escape(tool)}</td><td>{count}</td></tr>"
        for tool, count in sorted(by_tool.items(), key=lambda kv: -kv[1])
    )
    return (
        "<table><thead><tr><th>Tool</th><th>Findings</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )


def _render_owasp_table(by_owasp: dict) -> str:
    if not by_owasp:
        return '<div class="empty">No OWASP categories were attached to findings.</div>'
    rows = "".join(
        f"<tr><td>{html.escape(str(cat))}</td><td>{count}</td></tr>"
        for cat, count in sorted(by_owasp.items(), key=lambda kv: (-kv[1], kv[0]))
    )
    return (
        "<table><thead><tr><th>OWASP Category</th><th>Findings</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )


def _render_coverage_matrix(coverage: Dict[str, Dict[str, int]]) -> str:
    """Render one HTML table per OWASP family with hit/miss markers."""

    blocks: List[str] = []
    for family, mapping in ALL_FAMILIES:
        family_counts = coverage.get(family, {}) or {}
        rows: List[str] = []
        for code, canon in mapping.items():
            count = family_counts.get(code, 0)
            if count > 0:
                marker = (
                    f'<span class="pill medium">hit</span>&nbsp;'
                    f'<span class="muted">{count} finding(s)</span>'
                )
            else:
                marker = '<span class="pill info">not observed</span>'
            rows.append(
                "<tr>"
                f"<td>{html.escape(code)}</td>"
                f"<td>{html.escape(lookup(code) or canon)}</td>"
                f"<td>{marker}</td>"
                "</tr>"
            )
        block = (
            f'<div class="severity-block">'
            f"<h3>{html.escape(family)}</h3>"
            "<table><thead><tr>"
            "<th>Code</th><th>Category</th><th>Coverage</th>"
            "</tr></thead><tbody>"
            + "".join(rows)
            + "</tbody></table></div>"
        )
        blocks.append(block)
    return "\n".join(blocks) if blocks else '<div class="empty">No taxonomy mapped.</div>'


def _render_section_table(by_section: dict) -> str:
    if not by_section:
        return '<div class="empty">No section data available.</div>'
    order = (
        "Flag Captures",
        "Confirmed Exploits",
        "Validated Vulnerabilities",
        "Discovery / Attack Surface",
        "Tool Output / Passive Observations",
    )
    rows = "".join(
        f"<tr><td>{html.escape(section)}</td><td>{by_section.get(section, 0)}</td></tr>"
        for section in order
        if by_section.get(section, 0)
    )
    return (
        "<table><thead><tr><th>Section</th><th>Findings</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )


def _render_findings(findings: List[dict]) -> str:
    if not findings:
        return '<div class="empty">No findings were reported. Either the target is clean or the configured tools were unavailable.</div>'

    grouped = defaultdict(lambda: defaultdict(list))
    for f in findings:
        grouped[_finding_section(f)][f.get("severity", "info")].append(f)

    blocks: List[str] = []
    for section in (
        "Flag Captures",
        "Confirmed Exploits",
        "Validated Vulnerabilities",
        "Discovery / Attack Surface",
        "Tool Output / Passive Observations",
    ):
        section_group = grouped.get(section)
        if not section_group:
            continue
        blocks.append(f'<div class="severity-block"><h3>{html.escape(section)}</h3></div>')
        for sev in reversed(VALID_SEVERITIES):  # critical -> info
            if not section_group.get(sev):
                continue
            rows = []
            for f in sorted(
                section_group[sev],
                key=lambda x: (-severity_rank(x.get("severity", "info")), x.get("type", "")),
            ):
                also = f.get("also_reported_by") or []
                also_html = (
                    f"<br /><small>Also reported by: {html.escape(', '.join(also))}</small>"
                    if also
                    else ""
                )
                details = _render_finding_details(f)
                rows.append(
                    "<tr>"
                    f'<td><span class="pill {html.escape(sev)}">{html.escape(sev)}</span></td>'
                    f'<td>{html.escape(f.get("type", ""))}</td>'
                    f'<td>{html.escape(f.get("tool", ""))}{also_html}</td>'
                    f'<td class="endpoint">{html.escape(f.get("endpoint", ""))}</td>'
                    f'<td class="desc">{html.escape(f.get("description", ""))}{details}</td>'
                    "</tr>"
                )
            block = (
                f'<div class="severity-block">'
                f'<h3><span class="pill {html.escape(sev)}">{html.escape(sev.capitalize())}</span> '
                f"&middot; {len(section_group[sev])} finding(s)</h3>"
                "<table><thead><tr>"
                "<th>Severity</th><th>Type</th><th>Tool</th><th>Endpoint</th><th>Description</th>"
                "</tr></thead><tbody>"
                + "".join(rows)
                + "</tbody></table></div>"
            )
            blocks.append(block)
    return "\n".join(blocks)


def _safe_report_snippet(text: object, limit: int = 1500) -> str:
    """Avoid dumping binary blobs into HTML (KeePass, zip bytes, etc.)."""
    s = str(text or "")
    head = s[:8000]
    if head:
        bad = sum(1 for c in head if not c.isprintable() and c not in "\t\n\r")
        if "\x00" in head or (len(head) > 80 and bad / len(head) > 0.12):
            return f"[non-text/binary omitted; length={len(s)} chars]"
    return s[:limit]


def _render_finding_details(f: dict) -> str:
    details = []
    if f.get("achieved"):
        details.append(f"<strong>Achieved:</strong> {html.escape(str(f['achieved']))}")
    if f.get("owasp"):
        details.append(f"<strong>OWASP:</strong> {html.escape(str(f['owasp']))}")
    if f.get("confidence"):
        details.append(f"<strong>Confidence:</strong> {html.escape(str(f['confidence']))}")
    if f.get("validated"):
        details.append("<strong>Validated:</strong> yes")
    if f.get("evidence"):
        details.append(f"<strong>Evidence:</strong> <code>{html.escape(_safe_report_snippet(f['evidence']))}</code>")
    if f.get("impact"):
        details.append(f"<strong>Impact:</strong> {html.escape(str(f['impact']))}")
    if f.get("remediation"):
        details.append(f"<strong>Remediation:</strong> {html.escape(str(f['remediation']))}")
    if f.get("reproduction"):
        steps = "".join(f"<li>{html.escape(str(step))}</li>" for step in f["reproduction"])
        details.append(f"<strong>Reproduction:</strong><ol>{steps}</ol>")
    if f.get("affected_count"):
        details.append(f"<strong>Affected endpoints:</strong> {html.escape(str(f['affected_count']))}")
    if f.get("affected_examples"):
        examples = ", ".join(str(x) for x in f["affected_examples"])
        details.append(f"<strong>Examples:</strong> <code>{html.escape(examples)}</code>")
    if f.get("artifact_paths"):
        artifacts = ", ".join(str(x) for x in f["artifact_paths"])
        details.append(f"<strong>Artifacts:</strong> <code>{html.escape(artifacts)}</code>")
    if not details:
        return ""
    return '<div class="finding-details">' + "<br />".join(details) + "</div>"


def _finding_section(f: dict) -> str:
    if _finding_flag(f):
        return "Flag Captures"
    if f.get("achieved") or f.get("validation_kind") == "exploit":
        return "Confirmed Exploits"
    tool = str(f.get("tool") or "")
    type_ = str(f.get("type") or "").lower()
    severity = str(f.get("severity") or "info")
    if tool == "discovery" or "discovered endpoint" in type_ or "inventory" in type_:
        return "Discovery / Attack Surface"
    if f.get("validated") and severity in {"critical", "high", "medium"}:
        return "Validated Vulnerabilities"
    if tool in {"zap", "nikto", "dirb"} or severity in {"info", "low"}:
        return "Tool Output / Passive Observations"
    return "Validated Vulnerabilities"


def _finding_flag(f: dict) -> str:
    return detect_flag(
        {
            "type": f.get("type"),
            "description": f.get("description"),
            "evidence": f.get("evidence"),
            "achieved": f.get("achieved"),
        }
    )
