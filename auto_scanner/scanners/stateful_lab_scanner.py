"""Stateful workflow probes (registration / login / JWT / mass-assignment).

Bounded state-changing actions that only fire in ``active_mode`` and only
when the operator gives the scanner concrete paths/payloads to work with.
The scanner ships **no** hard-coded application-specific defaults: if a
key is absent it returns nothing instead of guessing CTF-flavoured paths.
"""

from __future__ import annotations

import secrets
import string
from typing import Any, Dict, Iterable, List, Optional, Tuple

from utils.http_client import HttpClient, interesting_json_keys
from utils.jwt_tools import decode_jwt, extract_jwts, jwt_risks, summarize_claims
from utils.owasp_taxonomy import label

from .base import BaseScanner, Finding


class StatefulLabScanner(BaseScanner):
    name = "stateful_lab"
    binary = ""

    def is_available(self) -> bool:
        return bool(self.ctx.extras.get("active_mode") and self.ctx.extras.get("stateful_enabled", True))

    def run(self) -> Tuple[Optional[object], List[Finding]]:
        client = HttpClient(
            self.ctx.target_url,
            timeout=int(self.ctx.extras.get("http_timeout", 10)),
            delay=float(self.ctx.extras.get("request_delay", 0.05)),
        )
        stateful = self.ctx.extras.get("stateful") or {}
        findings: List[Finding] = []
        users = self._create_lab_users(client, stateful)
        findings.extend(self._login_and_jwt_checks(client, users, stateful))
        findings.extend(self._registration_validation_checks(client, stateful))
        findings.extend(self._feedback_validation_checks(client, stateful))
        findings.extend(self._upload_validation_checks(client, stateful))
        findings.extend(self._role_mass_assignment_checks(client, stateful))
        self.log.info("stateful_lab produced %d finding(s).", len(findings))
        return None, findings

    def _create_lab_users(self, client: HttpClient, cfg: Dict[str, Any]) -> List[Dict[str, str]]:
        users: List[Dict[str, str]] = []
        if not cfg.get("create_users", True):
            return users
        registration_path = cfg.get("registration_path")
        if not registration_path:
            self.log.info("stateful_lab: registration_path is unset — skipping user creation.")
            return users
        for idx in range(int(cfg.get("user_count", 2))):
            suffix = _rand()
            # Alphanumeric usernames are accepted by virtually every framework's validator.
            username = f"autoscan{suffix}{idx}"
            email = f"{username}@example.com"
            password = cfg.get("password") or _strong_password()
            payload = _registration_payload(cfg, username=username, email=email, password=password)
            res = client.post(str(registration_path), json_body=payload)
            if res and res.status in {200, 201}:
                users.append({"username": username, "email": email, "password": password})
        self.ctx.extras["stateful_users_created"] = len(users)
        return users

    def _login_and_jwt_checks(
        self, client: HttpClient, users: List[Dict[str, str]], cfg: Dict[str, Any]
    ) -> Iterable[Finding]:
        candidates = list(users)
        auth = self.ctx.extras.get("auth") or {}
        if auth.get("username") and auth.get("password"):
            candidates.append({"email": str(auth["username"]), "password": str(auth["password"])})
        login_path = cfg.get("login_path")
        if not login_path:
            return
        for user in candidates[:2]:
            if cfg.get("username_field"):
                ufield = str(cfg.get("username_field"))
                uval = str(user.get(cfg.get("username_field")) or user.get("username") or user.get("email") or "")
            elif user.get("username"):
                ufield = "username"
                uval = str(user["username"])
            else:
                ufield = "email"
                uval = str(user.get("email") or "")
            login_cfg = {
                "enabled": True,
                "login_path": str(login_path),
                "method": "POST",
                "json": True,
                "username_field": ufield,
                "password_field": cfg.get("password_field") or "password",
                "username": uval,
                "password": user["password"],
            }
            ok, res = client.login(login_cfg)
            if not ok or not res:
                continue
            tokens = extract_jwts(res.body)
            parsed = res.json()
            if isinstance(parsed, dict):
                for key in ("token", "authentication", "accessToken", "jwt"):
                    val = parsed.get(key)
                    if isinstance(val, str):
                        tokens.extend(extract_jwts(val))
                    elif isinstance(val, dict):
                        tokens.extend(extract_jwts(str(val)))
            for token in list(dict.fromkeys(tokens)):
                decoded = decode_jwt(token)
                if not decoded:
                    continue
                risks = jwt_risks(decoded)
                if risks:
                    yield self.make_finding(
                        type_="JWT / Session Token Weakness",
                        severity="medium",
                        endpoint=client.resolve(str(login_path)),
                        description="Login response contains a JWT with risky claims or lifetime properties.",
                        owasp=label("W:A07", "API:2"),
                        confidence="high",
                        evidence=f"{summarize_claims(decoded)}; risks={'; '.join(risks)}",
                        reproduction=[
                            "Authenticate with the harness account.",
                            "Decode the JWT header/payload (do not verify the signature).",
                        ],
                        impact="Tokens can leak identity/authorization details or be long-lived.",
                        remediation="Use short-lived signed tokens with minimal claims and server-side authorization.",
                        validated=True,
                    )

    def _registration_validation_checks(self, client: HttpClient, cfg: Dict[str, Any]) -> Iterable[Finding]:
        path = cfg.get("registration_path")
        if not path:
            return
        suffix = _rand()
        weak = _registration_payload(cfg, username=f"weak{suffix}", email=f"weak{suffix}@example.com", password="a")
        res = client.post(str(path), json_body=weak)
        if res and res.status in {200, 201}:
            yield self.make_finding(
                type_="Weak Password Accepted During Registration",
                severity="medium",
                endpoint=client.resolve(str(path)),
                description="A registration endpoint accepted a trivially weak password.",
                owasp=label("W:A07", "API:2"),
                confidence="high",
                evidence=f"HTTP {res.status}; keys={_keys(res.json())}",
                reproduction=[f"POST a registration payload to {client.resolve(str(path))} with password 'a'."],
                impact="Weak password policy enables credential guessing and account takeover.",
                remediation="Enforce password length/complexity and breached-password checks.",
                validated=True,
            )

    def _feedback_validation_checks(self, client: HttpClient, cfg: Dict[str, Any]) -> Iterable[Finding]:
        path = cfg.get("feedback_path")
        if not path:
            return
        payload = dict(cfg.get("feedback_payload") or {"comment": "auto_scanner boundary test", "rating": 0})
        res = client.post(str(path), json_body=payload)
        if res and res.status in {200, 201}:
            yield self.make_finding(
                type_="Boundary Input Accepted",
                severity="medium",
                endpoint=client.resolve(str(path)),
                description="A state-changing endpoint accepted a boundary/invalid value.",
                owasp=label("W:A04", "API:6"),
                confidence="medium",
                evidence=f"HTTP {res.status}; payload keys={', '.join(payload.keys())}",
                reproduction=[f"POST {payload} to {client.resolve(str(path))}"],
                impact="Weak server-side validation can enable business logic abuse.",
                remediation="Validate value ranges server-side for every state-changing endpoint.",
                validated=True,
            )

    def _upload_validation_checks(self, client: HttpClient, cfg: Dict[str, Any]) -> Iterable[Finding]:
        # Standard-library multipart uploads add a lot of complexity; use JSON/text
        # probes for API-style upload endpoints when configured.
        path = cfg.get("upload_path")
        if not path:
            return
        payload = {"filename": "auto_scanner.txt", "content": "harmless test"}
        res = client.post(str(path), json_body=payload)
        if res and res.status in {200, 201, 202}:
            yield self.make_finding(
                type_="Upload Endpoint Accepts Synthetic File Payload",
                severity="low",
                endpoint=client.resolve(str(path)),
                description="An upload-like endpoint accepted a synthetic file payload.",
                owasp=label("W:A04", "API:8"),
                confidence="low",
                evidence=f"HTTP {res.status}",
                reproduction=[f"POST harmless JSON file payload to {client.resolve(str(path))}"],
                impact="Upload endpoints need stricter file type, size, storage and scanning controls.",
                remediation="Validate content type, extension, size, storage location and malware scanning.",
                validated=True,
            )

    def _role_mass_assignment_checks(self, client: HttpClient, cfg: Dict[str, Any]) -> Iterable[Finding]:
        if not cfg.get("mass_assignment_probe", True):
            return
        path = cfg.get("registration_path")
        if not path:
            return
        suffix = _rand()
        payload = _registration_payload(
            cfg,
            username=f"mass{suffix}",
            email=f"mass{suffix}@example.com",
            password=cfg.get("password") or _strong_password(),
        )
        payload.update({"role": "admin", "isAdmin": True, "admin": True})
        res = client.post(str(path), json_body=payload)
        parsed = res.json() if res else None
        text = str(parsed if parsed is not None else (res.body if res else ""))
        lowered = text.lower()
        if res and res.status in {200, 201} and ("admin" in lowered or "isadmin" in lowered):
            yield self.make_finding(
                type_="Mass Assignment / Privileged Field Accepted",
                severity="high",
                endpoint=client.resolve(str(path)),
                description="A registration/update endpoint accepted privileged-looking client-supplied fields.",
                owasp=label("API:3", "W:A01"),
                confidence="medium",
                evidence=text[:300],
                reproduction=[
                    f"POST registration/update payload including role/admin fields to {client.resolve(str(path))}"
                ],
                impact="Attackers may set privileged object properties if the backend binds request bodies directly.",
                remediation="Use explicit allowlists for writable request properties.",
                validated=True,
            )


def _registration_payload(
    cfg: Dict[str, Any],
    *,
    username: str,
    email: str,
    password: str,
) -> Dict[str, Any]:
    """Build a registration body from the operator-supplied template.

    If the config provides ``registration_payload`` (template strings using
    ``{username}``, ``{email}``, ``{password}``) it is used as-is. Otherwise
    a minimal generic body is built; no app-specific security-question/extra
    fields are baked in.
    """

    template = cfg.get("registration_payload")
    if isinstance(template, dict) and template:
        payload = _format_registration_template(template, {"username": username, "email": email, "password": password})
    else:
        payload = {
            "username": username,
            "email": email,
            "password": password,
        }
    extras = cfg.get("registration_extra_fields") or {}
    if isinstance(extras, dict):
        payload.update(extras)
    return payload


def _format_registration_template(template: Any, creds: Dict[str, str]) -> Any:
    if isinstance(template, dict):
        return {k: _format_registration_template(v, creds) for k, v in template.items()}
    if isinstance(template, list):
        return [_format_registration_template(v, creds) for v in template]
    if isinstance(template, str):
        try:
            return template.format(**creds)
        except (KeyError, IndexError, ValueError):
            return template
    return template


def _keys(value: Any) -> str:
    if isinstance(value, dict):
        return ", ".join(interesting_json_keys(value)[:15])
    return ""


def _rand(length: int = 8) -> str:
    return "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(length))


def _strong_password(length: int = 20) -> str:
    pool = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(pool) for _ in range(length))
