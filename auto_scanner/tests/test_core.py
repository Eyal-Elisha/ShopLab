from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace

from scanners.active_api_scanner import ActiveApiScanner, _classify_api_response
from scanners.active_web_scanner import GENERIC_ERROR, SQL_ERRORS
from scanners.authenticated_probes import AuthenticatedProbesScanner, _extract_role, _format_payload, _is_admin
from scanners.base import ScanContext
from scanners.browser_scanner import BrowserScanner
from scanners import ExploitChainScanner
from scanners.exploit_validator_scanner import _expand_route, _query_probes
from scanners.http_checks import (
    HttpChecksScanner,  # noqa: F401  smoke import
    HttpResponse as HttpCheckResponse,
    cookie_findings,
    csp_findings,
    looks_unreachable as _looks_like_unreachable_error,
    redirect_findings,
)
from scanners.llm_probe_scanner import LlmProbeScanner
from scanners.stateful_lab_scanner import StatefulLabScanner
from utils.dedupe import dedupe_findings
from utils.fingerprint import Fingerprint, fingerprint_target
from utils.http_client import (
    HttpResponse,
    extract_html_urls,
    extract_js_endpoints,
    paths_from_openapi,
    route_catalog_suggests_privileged_paths,
    sensitive_file_signature,
    urls_from_route_catalog,
)
from utils.scanner_config import apply_scan_profile
from utils.jwt_tools import build_alg_none_jwt, decode_jwt, extract_jwts, jwt_risks
from utils.owasp_taxonomy import codes_for, label, lookup
from utils.attack_planner import plan_attacks
from utils.report_generator import _finding_section
from utils.secret_harvest import detect_flag, extract_secrets, host_derived_codes, merge_wordlist
from utils.surface_model import build_surface_model


# ---------------------------------------------------------------------------
# Reachability + config + wiring
# ---------------------------------------------------------------------------


class ReachabilityHintTests(unittest.TestCase):
    def test_errno_111_is_unreachable_hint(self) -> None:
        self.assertTrue(_looks_like_unreachable_error("URLError: <urlopen error [Errno 111] Connection refused>"))

    def test_http_success_not_marked_unreachable(self) -> None:
        self.assertFalse(_looks_like_unreachable_error("nothing to see"))


class ConfigProfileTests(unittest.TestCase):
    def test_profile_merges_scanner_overrides(self) -> None:
        cfg = apply_scan_profile({"profile": "active-lab", "scanners": {"nuclei": True}})
        self.assertTrue(cfg["active_mode"])
        self.assertTrue(cfg["scanners"]["active_web"])
        self.assertTrue(cfg["scanners"]["active_api"])
        self.assertTrue(cfg["scanners"]["stateful_lab"])
        self.assertTrue(cfg["scanners"]["authenticated_probes"])
        self.assertTrue(cfg["scanners"]["exploit_validator"])
        self.assertTrue(cfg["scanners"]["ssl"])
        self.assertFalse(cfg["scanners"]["browser"])
        self.assertTrue(cfg["scanners"]["nuclei"])


class WiringTests(unittest.TestCase):
    def _ctx(self, **extras) -> ScanContext:
        return ScanContext(
            target_url="http://localhost:3000",
            run_dir=SimpleNamespace(),
            raw_dir=SimpleNamespace(),
            extras=extras,
        )

    def test_stateful_requires_active_mode(self) -> None:
        self.assertFalse(StatefulLabScanner(self._ctx(active_mode=False, stateful_enabled=True)).is_available())

    def test_browser_disabled_by_default(self) -> None:
        self.assertFalse(BrowserScanner(self._ctx(active_mode=True, browser_enabled=False)).is_available())

    def test_authenticated_probes_alias_matches(self) -> None:
        self.assertIs(ExploitChainScanner, AuthenticatedProbesScanner)

    def test_authenticated_probes_disabled_without_accept_risk(self) -> None:
        ctx = self._ctx(
            active_mode=True,
            authenticated_probes_enabled=True,
            accept_risk=False,
        )
        self.assertFalse(AuthenticatedProbesScanner(ctx).is_available())

    def test_authenticated_probes_enabled_when_all_gates_set(self) -> None:
        ctx = self._ctx(
            active_mode=True,
            authenticated_probes_enabled=True,
            accept_risk=True,
        )
        self.assertTrue(AuthenticatedProbesScanner(ctx).is_available())

    def test_llm_probe_skipped_without_target(self) -> None:
        ctx = self._ctx(active_mode=True, endpoints=["http://localhost:3000/"])
        self.assertFalse(LlmProbeScanner(ctx).is_available())

    def test_llm_probe_runs_when_chat_path_discovered(self) -> None:
        ctx = self._ctx(
            active_mode=True,
            endpoints=["http://localhost:3000/api/chat"],
        )
        self.assertTrue(LlmProbeScanner(ctx).is_available())

    def test_llm_probe_runs_when_url_explicit(self) -> None:
        ctx = self._ctx(
            active_mode=True,
            endpoints=["http://localhost:3000/"],
            llm_probe_url="http://localhost:3000/v1/messages",
        )
        self.assertTrue(LlmProbeScanner(ctx).is_available())


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


class JwtToolTests(unittest.TestCase):
    def test_extract_and_decode_jwt(self) -> None:
        token = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxIiwiZW1haWwiOiJhQGIuY29tIiwicm9sZSI6ImFkbWluIn0."
        self.assertEqual(extract_jwts(f"token={token}"), [token])
        decoded = decode_jwt(token)
        self.assertIsNotNone(decoded)
        assert decoded is not None
        risks = jwt_risks(decoded)
        self.assertIn("JWT uses no/empty alg", risks)
        self.assertIn("JWT has no exp claim", risks)
        self.assertIn("JWT exposes authorization claim: role", risks)

    def test_build_alg_none_jwt_decodes(self) -> None:
        token = build_alg_none_jwt({"id": 7, "username": "admin", "role": "admin"})
        decoded = decode_jwt(token)
        self.assertIsNotNone(decoded)
        assert decoded is not None
        self.assertEqual(str(decoded["header"].get("alg")).lower(), "none")
        self.assertEqual(decoded["payload"].get("role"), "admin")
        self.assertEqual(decoded["payload"].get("id"), 7)


# ---------------------------------------------------------------------------
# Discovery helpers (URL extraction, OpenAPI, route catalog)
# ---------------------------------------------------------------------------


class DiscoveryHelperTests(unittest.TestCase):
    def test_extract_html_urls_same_origin_only(self) -> None:
        html = '<a href="/api/items"></a><script src="http://evil.test/x.js"></script>'
        urls = extract_html_urls(html, "http://localhost:3000/")
        self.assertEqual(urls, ["http://localhost:3000/api/items"])

    def test_extract_js_endpoints(self) -> None:
        src = 'fetch("/v1/search?q=test"); const u="https://other.test/api";'
        urls = extract_js_endpoints(src, "http://localhost:3000/")
        self.assertEqual(urls, ["http://localhost:3000/v1/search?q=test"])

    def test_paths_from_openapi(self) -> None:
        urls = paths_from_openapi({"paths": {"/api/items": {}, "/v1/orders": {}}}, "http://localhost:3000/")
        self.assertIn("http://localhost:3000/api/items", urls)
        self.assertIn("http://localhost:3000/v1/orders", urls)

    def test_urls_from_route_catalog_recognises_admin_paths(self) -> None:
        doc = {"service": "x", "endpoints": {"admin": ["GET /api/admin/dashboard", "GET /api/admin/audit"]}}
        base = "http://localhost:8080/"
        urls = urls_from_route_catalog(doc, base)
        self.assertIn("http://localhost:8080/api/admin/dashboard", urls)
        self.assertIn("http://localhost:8080/api/admin/audit", urls)
        self.assertTrue(route_catalog_suggests_privileged_paths(doc))

    def test_surface_model_derives_generic_candidates(self) -> None:
        surface = build_surface_model(
            "https://example.test/",
            [
                "https://example.test/wp-content/theme.css",
                "https://example.test/api/search?q=abc",
                "https://example.test/api/graphql",
            ],
            [],
            {"fingerprint": {"framework_hints": ["nginx"], "auth_style": ["jwt"]}},
        )
        self.assertTrue(surface.is_https)
        self.assertTrue(surface.wordpress_detected)
        self.assertIn("sqlmap", surface.candidate_attacks)
        self.assertIn("ssl", surface.candidate_attacks)
        self.assertIn("graphql", surface.candidate_attacks)

    def test_attack_planner_schedules_sqlmap_for_broad_scan_feedback(self) -> None:
        surface = build_surface_model("http://localhost:3000/", ["http://localhost:3000/"], [], {})
        plan = plan_attacks(
            ["discovery", "sqlmap", "ssl", "zap"],
            surface,
            validation_enabled=True,
            intensity="safe",
            accept_risk=True,
            config={},
        )
        self.assertIn("zap", plan.validation_scanners)
        self.assertIn("sqlmap", plan.validation_scanners)
        self.assertIn("ssl", plan.skipped)

    def test_exploit_achievement_gets_confirmed_section(self) -> None:
        finding = {
            "tool": "sqlmap",
            "type": "SQL Injection",
            "severity": "high",
            "endpoint": "http://x/?id=1",
            "achieved": "SQL injection confirmed by sqlmap",
        }
        self.assertEqual(_finding_section(finding), "Confirmed Exploits")

    def test_flag_capture_gets_dedicated_section(self) -> None:
        finding = {
            "tool": "authenticated_probes",
            "type": "Token Capture",
            "severity": "critical",
            "endpoint": "http://x/api/me",
            "evidence": "FLAG{example_token}",
        }
        self.assertEqual(_finding_section(finding), "Flag Captures")

    def test_exploit_validator_expands_route_templates(self) -> None:
        expanded = _expand_route("http://localhost:8080/api/users/:userId/profile")
        self.assertIn("http://localhost:8080/api/users/1/profile", expanded)

    def test_exploit_validator_adds_search_queries(self) -> None:
        probes = _query_probes(["http://localhost:8080/api/products"])
        self.assertIn("http://localhost:8080/api/products?q=%27", probes)

    def test_scanner_source_has_no_specific_lab_strings(self) -> None:
        root = Path(__file__).resolve().parents[1]
        forbidden = ["juice" + "shop", "shop" + "lab"]
        for path in list((root / "scanners").rglob("*.py")) + list((root / "utils").rglob("*.py")):
            text = path.read_text(encoding="utf-8", errors="ignore").lower()
            for token in forbidden:
                self.assertNotIn(token, text, str(path))


# ---------------------------------------------------------------------------
# Dedupe / classification / suppression
# ---------------------------------------------------------------------------


class DedupeSchemaTests(unittest.TestCase):
    def test_dedupe_preserves_extended_fields(self) -> None:
        findings = [
            {
                "tool": "a",
                "type": "Issue",
                "severity": "medium",
                "endpoint": "http://x/",
                "description": "short",
                "confidence": "low",
            },
            {
                "tool": "b",
                "type": "Issue",
                "severity": "medium",
                "endpoint": "http://x",
                "description": "longer description",
                "confidence": "high",
                "evidence": "proof",
                "validated": True,
                "reproduction": ["step 1"],
            },
        ]
        out = dedupe_findings(findings)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["description"], "longer description")
        self.assertEqual(out[0]["confidence"], "high")
        self.assertEqual(out[0]["evidence"], "proof")
        self.assertTrue(out[0]["validated"])
        self.assertEqual(out[0]["also_reported_by"], ["b"])
        self.assertEqual(out[0]["reproduction"], ["step 1"])


class FalsePositiveSuppressionTests(unittest.TestCase):
    def test_spa_fallback_is_not_sensitive_file(self) -> None:
        home = HttpResponse(
            url="http://localhost:3000/",
            status=200,
            headers={"Content-Type": "text/html"},
            body="<html><div id=\"root\"></div><script src=\"main.js\"></script></html>",
        )
        fallback = HttpResponse(
            url="http://localhost:3000/.env",
            status=200,
            headers={"Content-Type": "text/html"},
            body=home.body,
        )
        self.assertIsNone(sensitive_file_signature(".env", fallback, home))

    def test_real_env_signature_is_sensitive_file(self) -> None:
        res = HttpResponse(
            url="http://localhost:3000/.env",
            status=200,
            headers={"Content-Type": "text/plain"},
            body="DATABASE_URL=postgres://example\nAPI_KEY=abc123\n",
        )
        self.assertEqual(sensitive_file_signature(".env", res), "env-style key/value secrets")

    def test_generic_error_is_not_sql_error(self) -> None:
        body = "<title>Error: Unexpected path: /api/test</title>"
        self.assertIsNone(SQL_ERRORS.search(body))
        self.assertIsNotNone(GENERIC_ERROR.search(body))


class ApiClassificationTests(unittest.TestCase):
    def test_public_catalog_is_inventory(self) -> None:
        parsed = {"data": [{"id": 1, "name": "Sample Item", "price": 1.99}]}
        self.assertEqual(_classify_api_response("http://x/api/products", parsed, []), "inventory")

    def test_sensitive_keys_are_sensitive(self) -> None:
        parsed = {"id": 1, "email": "a@example.test", "role": "admin"}
        self.assertEqual(_classify_api_response("http://x/api/users/1", parsed, ["email", "role"]), "sensitive")

    def test_admin_path_is_admin(self) -> None:
        parsed = {"config": {"feature": True}}
        self.assertEqual(_classify_api_response("http://x/admin/configuration", parsed, []), "admin")

    def test_unsafe_methods_are_aggregated(self) -> None:
        ctx = ScanContext(
            target_url="http://localhost:3000",
            run_dir=SimpleNamespace(),
            raw_dir=SimpleNamespace(),
            extras={"active_api_max_options_tests": 10},
        )
        scanner = ActiveApiScanner(ctx)

        class FakeClient:
            def options(self, url: str) -> HttpResponse:
                return HttpResponse(
                    url=url,
                    status=200,
                    headers={"Allow": "GET,HEAD,PUT,PATCH,POST,DELETE"},
                    body="",
                )

        findings = list(scanner._unsafe_methods(FakeClient(), ["http://x/api/A", "http://x/api/B"]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["affected_count"], 2)
        self.assertIn("http://x/api/A", findings[0]["affected_examples"])


# ---------------------------------------------------------------------------
# Secret harvesting (no lab-specific strings)
# ---------------------------------------------------------------------------


class SecretHarvestTests(unittest.TestCase):
    def test_extract_secrets_from_debug_block(self) -> None:
        body = {
            "valid": True,
            "code": "WELCOME10",
            "discountPercent": 10,
            "debug": {
                "internalNote": "Internal staff testing coupon",
                "adminPromoKey": "internal-checkout-override-token",
            },
        }
        out = extract_secrets(body)
        self.assertIn("internal-checkout-override-token", out)

    def test_extract_secrets_from_freetext_uppercase_token(self) -> None:
        body = {
            "id": 1,
            "staff_notes": "Fulfillment: apply coupon LAB-INTERNAL-OVERRIDE for QA. Do not ship.",
        }
        out = extract_secrets(body)
        self.assertIn("LAB-INTERNAL-OVERRIDE", out)

    def test_detect_flag_field(self) -> None:
        body = {"flag": "DEMO{generic_finding_marker}"}
        self.assertEqual(detect_flag(body), "DEMO{generic_finding_marker}")

    def test_detect_flag_inline_string(self) -> None:
        self.assertEqual(detect_flag("you have FLAG{some_value} here"), "FLAG{some_value}")

    def test_detect_flag_internal_suffix_key(self) -> None:
        body = {"user": {"internal_flag": "DEMO{idor_under_user}"}}
        self.assertEqual(detect_flag(body), "DEMO{idor_under_user}")

    def test_host_derived_codes_skips_localhost(self) -> None:
        self.assertEqual(host_derived_codes("localhost"), [])
        codes = host_derived_codes("example-corp.test")
        self.assertTrue(any(c.startswith("EXAMPLE-") for c in codes))
        # Year-stamped codes are no longer hardcoded.
        self.assertFalse(any("-2024" in c or "-2025" in c or "-2026" in c for c in codes))

    def test_merge_wordlist_dedupes(self) -> None:
        out = merge_wordlist(["A", "B"], ["B", "C"])
        self.assertEqual(out, ["A", "B", "C"])


# ---------------------------------------------------------------------------
# Authenticated probe helpers
# ---------------------------------------------------------------------------


class AuthenticatedProbeHelpersTests(unittest.TestCase):
    def test_format_payload_substitutes_creds(self) -> None:
        creds = {"username": "u1", "email": "u1@example.test", "password": "pw"}
        template = {"username": "{username}", "email": "{email}", "password": "{password}", "static": 1}
        self.assertEqual(
            _format_payload(template, creds),
            {"username": "u1", "email": "u1@example.test", "password": "pw", "static": 1},
        )

    def test_extract_role_handles_string_and_bool(self) -> None:
        self.assertEqual(_extract_role({"user": {"role": "admin"}}), "admin")
        self.assertEqual(_extract_role({"isAdmin": True}), "admin")
        self.assertEqual(_extract_role({"isAdmin": False}), "")

    def test_is_admin_classifier(self) -> None:
        self.assertTrue(_is_admin("admin"))
        self.assertTrue(_is_admin("Administrator"))
        self.assertFalse(_is_admin("user"))
        self.assertFalse(_is_admin(""))

    def test_random_passwords_are_not_hardcoded(self) -> None:
        first = AuthenticatedProbesScanner.make_creds()
        second = AuthenticatedProbesScanner.make_creds()
        self.assertNotEqual(first["password"], second["password"])
        for creds in (first, second):
            self.assertGreaterEqual(len(creds["password"]), 16)


class AuthenticatedProbeCrawlTests(unittest.TestCase):
    def test_numeric_path_templates_only_from_same_origin_crawl(self) -> None:
        from scanners.authenticated_probes.probes import endpoint_paths_normalized, collect_numeric_templates

        paths = endpoint_paths_normalized(
            [
                "http://localhost:8080/api/products/12",
                "https://evil.example/api/users/3/profile",
            ],
            "http://localhost:8080/",
        )
        tmpl = collect_numeric_templates(paths, 48)
        self.assertIn("api/products/{ID}", tmpl)
        self.assertTrue(all("evil" not in t for t in tmpl))


# ---------------------------------------------------------------------------
# OWASP taxonomy
# ---------------------------------------------------------------------------


class OwaspTaxonomyTests(unittest.TestCase):
    def test_lookup_known_codes(self) -> None:
        self.assertEqual(lookup("W:A01"), "A01:2025 Broken Access Control")
        self.assertEqual(lookup("API:1"), "API1:2023 Broken Object Level Authorization")
        self.assertEqual(lookup("LLM:01"), "LLM01:2025 Prompt Injection")

    def test_lookup_unknown_returns_empty(self) -> None:
        self.assertEqual(lookup(""), "")
        self.assertEqual(lookup("DOES_NOT_EXIST"), "")

    def test_label_concatenates_known_codes(self) -> None:
        rendered = label("W:A01", "API:1")
        self.assertIn("A01:2025", rendered)
        self.assertIn("API1:2023", rendered)
        # Drops unknowns silently:
        self.assertEqual(label("W:A01", "ZZ"), "A01:2025 Broken Access Control")

    def test_codes_for_handles_multi_family_label(self) -> None:
        rendered = label("W:A01", "API:1")
        self.assertEqual(set(codes_for(rendered)), {"W:A01", "API:1"})


# ---------------------------------------------------------------------------
# Fingerprint
# ---------------------------------------------------------------------------


class FingerprintTests(unittest.TestCase):
    def test_fingerprint_target_extracts_cookies_and_spa(self) -> None:
        class FakeClient:
            def __init__(self) -> None:
                self.calls = []

            def get(self, path, **kwargs):  # noqa: D401 — test stub
                self.calls.append(path)
                if path in ("/", ""):
                    return _resp(
                        "http://localhost:3000/",
                        200,
                        {
                            "Server": "nginx/1.25",
                            "Set-Cookie": "connect.sid=abc; Path=/",
                            "Content-Type": "text/html",
                        },
                        '<html><app-root></app-root><script src="main.js"></script></html>',
                    )
                if path == "api":
                    return _resp(
                        "http://localhost:3000/api",
                        200,
                        {"Content-Type": "application/json"},
                        '{"endpoints": {"users": ["GET /api/users"]}}',
                    )
                return _resp(path, 404, {}, "")

        fp = fingerprint_target(FakeClient(), "http://localhost:3000/")
        self.assertTrue(fp.spa)
        self.assertIn("nginx", fp.framework_hints)
        self.assertIn("connect.sid", fp.cookie_hints)
        self.assertIn("/auth/login", fp.candidate_paths)
        self.assertIn("rest-json-index", fp.api_style)

    def test_fingerprint_dataclass_dedupes_candidates(self) -> None:
        fp = Fingerprint(target="http://x")
        fp.merge_candidates(["/a", "/b", "/a"])
        fp.merge_candidates(["/c"])
        self.assertEqual(fp.candidate_paths, ["/a", "/b", "/c"])


# ---------------------------------------------------------------------------
# http_checks submodules
# ---------------------------------------------------------------------------


class CookieAuditTests(unittest.TestCase):
    def test_missing_attributes_emit_finding(self) -> None:
        response = _resp(
            "https://api.example/",
            200,
            {"Set-Cookie": "sid=abc; Path=/"},
            "",
        )
        findings = cookie_findings(response, _mk_finding)
        self.assertEqual(len(findings), 1)
        self.assertIn("missing Secure flag", findings[0]["description"])
        self.assertIn("missing HttpOnly flag", findings[0]["description"])
        self.assertIn("missing SameSite attribute", findings[0]["description"])

    def test_complete_cookie_is_silent(self) -> None:
        response = _resp(
            "https://api.example/",
            200,
            {"Set-Cookie": "sid=abc; Secure; HttpOnly; SameSite=Lax; Path=/"},
            "",
        )
        self.assertEqual(cookie_findings(response, _mk_finding), [])


class CspAuditTests(unittest.TestCase):
    def test_unsafe_inline_is_flagged(self) -> None:
        response = _resp(
            "http://localhost/",
            200,
            {"Content-Security-Policy": "default-src 'self' 'unsafe-inline'"},
            "",
        )
        findings = csp_findings(response, _mk_finding)
        self.assertEqual(len(findings), 1)
        self.assertIn("unsafe-inline", findings[0]["evidence"])

    def test_strong_csp_is_silent(self) -> None:
        response = _resp(
            "http://localhost/",
            200,
            {
                "Content-Security-Policy": "default-src 'self'; script-src 'self'; object-src 'none'",
            },
            "",
        )
        self.assertEqual(csp_findings(response, _mk_finding), [])


class GenericRedirectTests(unittest.TestCase):
    def test_redirect_param_is_only_attempted_on_seen_urls(self) -> None:
        import scanners.http_checks as http_checks

        original = http_checks.get

        def fake_get(url, **kwargs):
            if "probe.invalid" in url:
                return _resp(url, 302, {"Location": "https://probe.invalid/"}, "")
            return None

        http_checks.get = fake_get
        try:
            findings = redirect_findings(
                ["http://localhost/redirect?to=/local"],
                ["to"],
                _mk_finding,
            )
        finally:
            http_checks.get = original

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["type"], "Open Redirect")


# ---------------------------------------------------------------------------
# LLM probe
# ---------------------------------------------------------------------------


class LlmProbeTests(unittest.TestCase):
    def test_leak_marker_detected(self) -> None:
        ctx = ScanContext(
            target_url="http://localhost:3000",
            run_dir=SimpleNamespace(),
            raw_dir=SimpleNamespace(),
            extras={
                "active_mode": True,
                "endpoints": ["http://localhost:3000/api/chat"],
                "llm_probe_url": "http://localhost:3000/api/chat",
            },
        )
        scanner = LlmProbeScanner(ctx)
        scanner._post_prompt = lambda url, prompt: '{"reply": "Sure: AUTOSCAN_LLM_LEAK"}'  # type: ignore[assignment]
        _, findings = scanner.run()
        self.assertEqual(len(findings), 1)
        self.assertIn("LLM01:2025", findings[0]["owasp"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resp(url: str, status: int, headers: dict, body: str):
    return HttpCheckResponse(url=url, status=status, headers=headers, body=body, location=headers.get("Location"))


def _mk_finding(**kwargs):
    out = {"tool": "test"}
    if "type_" in kwargs:
        kwargs["type"] = kwargs.pop("type_")
    out.update(kwargs)
    out.setdefault("severity", kwargs.get("severity") or "info")
    return out


if __name__ == "__main__":
    unittest.main()
