"""Maps short OWASP codes (``W:A01``, ``API:1``, …) to canonical titles for reports."""

from __future__ import annotations

from typing import Dict, Iterable, List, Mapping, Tuple

WEB_2025: Dict[str, str] = {
    "W:A01": "A01:2025 Broken Access Control",
    "W:A02": "A02:2025 Cryptographic Failures",
    "W:A03": "A03:2025 Injection",
    "W:A04": "A04:2025 Insecure Design",
    "W:A05": "A05:2025 Security Misconfiguration",
    "W:A06": "A06:2025 Vulnerable and Outdated Components",
    "W:A07": "A07:2025 Identification and Authentication Failures",
    "W:A08": "A08:2025 Software and Data Integrity Failures",
    "W:A09": "A09:2025 Security Logging and Monitoring Failures",
    "W:A10": "A10:2025 Server-Side Request Forgery (SSRF)",
}

API_2023: Dict[str, str] = {
    "API:1": "API1:2023 Broken Object Level Authorization",
    "API:2": "API2:2023 Broken Authentication",
    "API:3": "API3:2023 Broken Object Property Level Authorization",
    "API:4": "API4:2023 Unrestricted Resource Consumption",
    "API:5": "API5:2023 Broken Function Level Authorization",
    "API:6": "API6:2023 Unrestricted Access to Sensitive Business Flows",
    "API:7": "API7:2023 Server Side Request Forgery",
    "API:8": "API8:2023 Security Misconfiguration",
    "API:9": "API9:2023 Improper Inventory Management",
    "API:10": "API10:2023 Unsafe Consumption of APIs",
}

LLM_2025: Dict[str, str] = {
    "LLM:01": "LLM01:2025 Prompt Injection",
    "LLM:02": "LLM02:2025 Sensitive Information Disclosure",
    "LLM:03": "LLM03:2025 Supply Chain",
    "LLM:04": "LLM04:2025 Data and Model Poisoning",
    "LLM:05": "LLM05:2025 Improper Output Handling",
    "LLM:06": "LLM06:2025 Excessive Agency",
    "LLM:07": "LLM07:2025 System Prompt Leakage",
    "LLM:08": "LLM08:2025 Vector and Embedding Weaknesses",
    "LLM:09": "LLM09:2025 Misinformation",
    "LLM:10": "LLM10:2025 Unbounded Consumption",
}

ALL_FAMILIES: Tuple[Tuple[str, Mapping[str, str]], ...] = (
    ("Web 2025", WEB_2025),
    ("API 2023", API_2023),
    ("LLM 2025", LLM_2025),
)


def label(*codes: str) -> str:
    parts: List[str] = []
    for code in codes:
        if not code:
            continue
        canonical = lookup(str(code))
        if canonical and canonical not in parts:
            parts.append(canonical)
    return " / ".join(parts)


def lookup(code: str) -> str:
    key = (code or "").strip()
    if not key:
        return ""
    for _, mapping in ALL_FAMILIES:
        if key in mapping:
            return mapping[key]
    return ""


def codes_for(label_str: str) -> List[str]:
    if not label_str:
        return []
    found: List[str] = []
    for _, mapping in ALL_FAMILIES:
        for code, canon in mapping.items():
            if canon and canon in label_str and code not in found:
                found.append(code)
    return found


__all__ = [
    "ALL_FAMILIES",
    "API_2023",
    "LLM_2025",
    "WEB_2025",
    "codes_for",
    "label",
    "lookup",
]
