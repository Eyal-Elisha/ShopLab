"""Optional Playwright-powered browser checks for SPAs.

The scanner is optional: it is skipped unless Playwright is installed and
``browser_enabled`` is true in the config. It does not make Playwright a core
dependency of auto_scanner.
"""

from __future__ import annotations

import importlib.util
from typing import List, Optional, Tuple
from urllib.parse import quote

from utils.owasp_taxonomy import label

from .base import BaseScanner, Finding


class BrowserScanner(BaseScanner):
    name = "browser"
    binary = ""

    def is_available(self) -> bool:
        return bool(
            self.ctx.extras.get("active_mode")
            and self.ctx.extras.get("browser_enabled")
            and importlib.util.find_spec("playwright") is not None
        )

    def execute(self):  # type: ignore[no-untyped-def]
        if self.ctx.extras.get("browser_enabled") and importlib.util.find_spec("playwright") is None:
            self.log.warning(
                "Playwright is not installed - skipping browser scanner. "
                "Install with: python -m pip install playwright && python -m playwright install chromium"
            )
            return None, []
        return super().execute()

    def run(self) -> Tuple[Optional[object], List[Finding]]:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright

        findings: List[Finding] = []
        target = self.ctx.target_url.rstrip("/")
        # Browser routes default to root only — anything more specific must come from the operator.
        routes = self.ctx.extras.get("browser_routes") or ["/"]
        payload = str(self.ctx.extras.get("browser_xss_payload") or "<iframe src=\"javascript:alert(`xss`)\">")
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                findings.extend(self._route_checks(page, target, routes))
                findings.extend(self._dom_xss_probe(page, target, payload))
                findings.extend(self._storage_checks(page, target))
                browser.close()
        except PlaywrightError as exc:
            self.log.warning("Playwright browser scan failed: %s", exc)
        self.log.info("browser produced %d finding(s).", len(findings))
        return None, findings

    def _route_checks(self, page, target: str, routes: List[str]) -> List[Finding]:  # type: ignore[no-untyped-def]
        findings: List[Finding] = []
        for route in routes[:20]:
            url = target + str(route)
            try:
                page.goto(url, wait_until="networkidle", timeout=10_000)
                title = page.title()
                body_text = page.locator("body").inner_text(timeout=5_000)[:500]
            except Exception:
                continue
            mark_words = (url + " " + title + " " + body_text).lower()
            if any(needle in mark_words for needle in ("admin", "internal", "staff", "management", "dashboard")):
                findings.append(
                    self.make_finding(
                        type_="Client-Side Route Reachable",
                        severity="medium" if "admin" in url.lower() else "info",
                        endpoint=url,
                        description="A client-side SPA route is reachable in the browser.",
                        owasp=label("W:A01", "W:A05"),
                        confidence="medium",
                        evidence=f"title={title}; body={body_text[:200]}",
                        reproduction=[f"Open {url} in a browser."],
                        impact="Hidden client-side routes can reveal privileged UI or attack surface.",
                        remediation="Enforce server/API authorization; do not rely on hidden routes.",
                        validated=True,
                    )
                )
        return findings

    def _dom_xss_probe(self, page, target: str, payload: str) -> List[Finding]:  # type: ignore[no-untyped-def]
        findings: List[Finding] = []
        marker = "autoScannerDomXss"
        probe_payload = payload.replace("xss", marker)
        url = target + "/#/search?q=" + quote(probe_payload)
        dialog_seen = {"value": False}

        def on_dialog(dialog):  # type: ignore[no-untyped-def]
            dialog_seen["value"] = True
            dialog.dismiss()

        try:
            page.on("dialog", on_dialog)
            page.goto(url, wait_until="networkidle", timeout=10_000)
            content = page.content()
            if dialog_seen["value"] or probe_payload in content:
                findings.append(
                    self.make_finding(
                        type_="DOM XSS Browser Probe",
                        severity="high" if dialog_seen["value"] else "medium",
                        endpoint=url,
                        description="A browser-rendered payload was reflected/executed in the SPA route.",
                        owasp=label("W:A03"),
                        confidence="high" if dialog_seen["value"] else "medium",
                        evidence="dialog observed" if dialog_seen["value"] else probe_payload,
                        reproduction=[f"Open {url}", "Observe payload reflection or JavaScript dialog."],
                        impact="DOM injection can execute attacker-controlled JavaScript in victim browsers.",
                        remediation="Avoid unsafe DOM sinks and encode/validate route/query data.",
                        validated=True,
                    )
                )
        except Exception:
            return findings
        return findings

    def _storage_checks(self, page, target: str) -> List[Finding]:  # type: ignore[no-untyped-def]
        findings: List[Finding] = []
        try:
            page.goto(target + "/", wait_until="networkidle", timeout=10_000)
            keys = page.evaluate("Object.keys(window.localStorage).concat(Object.keys(window.sessionStorage))")
        except Exception:
            return findings
        interesting = [str(k) for k in keys if any(s in str(k).lower() for s in ("token", "jwt", "auth", "user"))]
        if interesting:
            findings.append(
                self.make_finding(
                    type_="Sensitive Browser Storage Keys",
                    severity="low",
                    endpoint=target + "/",
                    description="Browser storage contains authentication/user-related key names.",
                    owasp=label("W:A07"),
                    confidence="low",
                    evidence=", ".join(interesting[:10]),
                    reproduction=["Open the application and inspect localStorage/sessionStorage keys."],
                    impact="Tokens in browser storage are exposed to successful XSS.",
                    remediation="Minimize sensitive browser storage and harden XSS defenses.",
                    validated=True,
                )
            )
        return findings
