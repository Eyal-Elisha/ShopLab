"""AuthenticatedProbesScanner: scanner class + workflow orchestration."""

from __future__ import annotations

import secrets
import string
from typing import Any, List, Optional, Set, Tuple

from utils.http_client import HttpClient

from ..base import BaseScanner, Finding
from . import probes
from .templates import (
    DEFAULT_LOGIN_PATH, DEFAULT_LOGIN_PAYLOAD, DEFAULT_PROFILE_PATHS,
    DEFAULT_REGISTRATION_PATH, DEFAULT_REGISTRATION_PAYLOAD,
)
from . import templates as finding_templates


class AuthenticatedProbesScanner(BaseScanner):
    name = "authenticated_probes"
    binary = ""

    def is_available(self) -> bool:
        return bool(
            self.ctx.extras.get("active_mode")
            and self.ctx.extras.get("authenticated_probes_enabled")
            and self.ctx.extras.get("accept_risk")
        )

    def make_client(self) -> HttpClient:
        return HttpClient(
            self.ctx.target_url,
            timeout=int(self.ctx.extras.get("http_timeout", 10)),
            delay=float(self.ctx.extras.get("request_delay", 0.05)),
        )

    @staticmethod
    def make_creds() -> dict[str, str]:
        slug = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(10))
        password_pool = string.ascii_letters + string.digits + "!@#$%^&*"
        password = "".join(secrets.choice(password_pool) for _ in range(20))
        return {
            "username": f"autoscan{slug}",
            "email": f"autoscan{slug}@example.com",
            "password": password,
        }

    def run(self) -> Tuple[Optional[object], List[Finding]]:
        cfg: dict = dict(self.ctx.extras.get("stateful") or {})
        cfg.setdefault("registration_path", DEFAULT_REGISTRATION_PATH)
        cfg.setdefault("login_path", DEFAULT_LOGIN_PATH)
        cfg.setdefault("registration_payload", DEFAULT_REGISTRATION_PAYLOAD)
        cfg.setdefault("login_payload", DEFAULT_LOGIN_PAYLOAD)
        cfg.setdefault("profile_paths", list(DEFAULT_PROFILE_PATHS))

        anon = self.make_client()
        public_codes = probes.bootstrap_public_catalog(self.log, self.ctx.extras, self.ctx.target_url, anon)

        client = self.make_client()
        creds = self.make_creds()

        if not probes.register(self, client, cfg, creds):
            self.log.info("authenticated_probes: aborting harness (registration failed).")
            return None, [self.make_finding(**finding_templates.harness_aborted(self.ctx.target_url.rstrip("/"), "registration failed"))]
        if not probes.login(self, client, cfg, creds):
            self.log.info("authenticated_probes: aborting harness (login failed).")
            return None, [self.make_finding(**finding_templates.harness_aborted(self.ctx.target_url.rstrip("/"), "login failed"))]

        baseline_role = probes.fetch_role(client, cfg)
        self.log.info("authenticated_probes: baseline role = %r", baseline_role)

        findings: List[dict] = []
        seen_tokens: Set[str] = set()

        all_secrets: Set[str] = set(public_codes)
        if public_codes:
            findings.append(self.make_finding(**finding_templates.catalog_tokens(self.ctx.target_url.rstrip("/"), public_codes)))

        secrets_harvested, leak_evidence = probes.harvest_secrets(self, client)
        all_secrets.update(secrets_harvested)
        if secrets_harvested:
            leak_sample = "; ".join(f"{u} → {s}" for u, s in leak_evidence[:5])
            findings.append(
                self.make_finding(**finding_templates.leaked_strings(
                    leak_evidence[0][0] if leak_evidence else self.ctx.target_url,
                    leak_sample or ", ".join(sorted(secrets_harvested)[:5]),
                ))
            )

        if self.ctx.extras.get("authenticated_probes_probe_derived_numeric_ids", True):
            findings.extend(probes.probe_discovery_derived_numeric_ids(self, client))

        if self.ctx.extras.get("authenticated_probes_probe_state_changing_writes", False):
            findings.extend(probes.probe_discovery_derived_writes(self, client))

        if self.ctx.extras.get("authenticated_probes_probe_search_sql", True):
            findings.extend(probes.probe_sql_search(self, client))

        if self.ctx.extras.get("authenticated_probes_probe_price_manipulation", True):
            findings.extend(probes.probe_client_price_manipulation(self, client))

        coupon_codes, coup_evidence = probes.brute_coupons(self, client)
        if coupon_codes:
            all_secrets.update(coupon_codes)
            coup_sample = "; ".join(f"{u} [{c}] → {s}" for u, c, s in coup_evidence[:5])
            findings.append(
                self.make_finding(**finding_templates.coupon_verbose(
                    coup_evidence[0][0] if coup_evidence else self.ctx.target_url,
                    coup_sample or ", ".join(sorted(coupon_codes)[:5]),
                ))
            )

        escalation = None
        if all_secrets:
            escalation = probes.attempt_escalation(self, client, cfg, creds, baseline_role, all_secrets)
            if escalation:
                ev_line = (
                    f"{escalation['method']} {escalation['path']} | tries={escalation['attempts']} | "
                    f"roles {escalation['old_role']} -> {escalation['new_role']}"
                )
                findings.append(self.make_finding(**finding_templates.profile_mutation(escalation["path"], ev_line, escalation)))
            else:
                self.log.info("authenticated_probes: mass-assignment / header guesses did not change role.")
        else:
            self.log.info("authenticated_probes: no harvestable strings yet — skipping mass-assignment phase.")

        tok, tok_url, body_snip = probes.capture_sensitive_token(self, client)
        if tok and tok not in seen_tokens:
            seen_tokens.add(tok)
            if escalation:
                findings.append(self.make_finding(**finding_templates.post_escalation_token(tok_url, tok, escalation)))
            else:
                findings.append(self.make_finding(**finding_templates.discovery_route_token(
                    tok_url, tok, body_snip, note="privileged-looking path surfaced during crawl ingest",
                )))

        experimental = bool(self.ctx.extras.get("experimental_auth"))
        if experimental:
            findings.extend(probes.probe_jwt_none(self, self.make_client, seen_tokens))
            findings.extend(probes.probe_remember_cookie(self, self.make_client, seen_tokens))
        else:
            if self.ctx.extras.get("authenticated_probes_jwt_payloads") or self.ctx.extras.get("authenticated_probes_remember_cookie_names"):
                self.log.info(
                    "authenticated_probes: opt-in destructive probes are configured but "
                    "--experimental-auth is not set; skipping."
                )

        self.log.info("authenticated_probes produced %d finding(s).", len(findings))
        return None, findings


ExploitChainScanner = AuthenticatedProbesScanner

__all__ = ["AuthenticatedProbesScanner", "ExploitChainScanner"]
