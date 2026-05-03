"""Minimal HTTPS/TLS validation scanner.

Uses Python's stdlib so the scanner can still produce useful SSL findings when
external tools such as sslscan/testssl.sh are not installed.
"""

from __future__ import annotations

import socket
import ssl
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urlparse

from .base import BaseScanner, Finding


class SslScanner(BaseScanner):
    name = "ssl"
    binary = ""

    def is_available(self) -> bool:
        surface = self.ctx.extras.get("surface_model") or {}
        return bool(surface.get("is_https"))

    def run(self) -> Tuple[Optional[Path], List[Finding]]:
        parsed = urlparse(self.ctx.target_url)
        host = parsed.hostname
        if not host:
            return None, []
        port = parsed.port or 443
        log_path = self.raw_path("tls.txt")
        findings: List[Finding] = []

        try:
            context = ssl.create_default_context()
            with socket.create_connection((host, port), timeout=min(self.ctx.timeout, 15)) as sock:
                with context.wrap_socket(sock, server_hostname=host) as tls:
                    cert = tls.getpeercert()
                    protocol = tls.version() or "unknown"
                    cipher = tls.cipher()
        except ssl.SSLError as exc:
            log_path.write_text(f"TLS handshake/validation failed: {exc}\n", encoding="utf-8")
            return log_path, [
                self.make_finding(
                    type_="TLS certificate or handshake validation failed",
                    severity="high",
                    endpoint=self.ctx.target_url,
                    description="The scanner could not complete a verified TLS handshake.",
                    confidence="high",
                    evidence=str(exc),
                    remediation="Install a valid certificate chain and disable obsolete TLS settings.",
                    phase="validation",
                    validation_kind="exploit",
                    exploit_attempted=True,
                    achieved="TLS validation failure confirmed",
                    artifact_paths=[str(log_path)],
                )
            ]
        except OSError as exc:
            log_path.write_text(f"TLS connection failed: {exc}\n", encoding="utf-8")
            return log_path, []

        not_after = str(cert.get("notAfter") or "")
        expires = _parse_cert_time(not_after)
        log_path.write_text(
            f"host={host}\nport={port}\nprotocol={protocol}\ncipher={cipher}\nnotAfter={not_after}\n",
            encoding="utf-8",
        )
        if expires is not None:
            now = datetime.now(timezone.utc)
            days_left = (expires - now).days
            if days_left < 0:
                findings.append(
                    self.make_finding(
                        type_="TLS certificate expired",
                        severity="high",
                        endpoint=self.ctx.target_url,
                        description="The presented TLS certificate is expired.",
                        confidence="high",
                        evidence=f"expired {abs(days_left)} day(s) ago; notAfter={not_after}",
                        remediation="Renew and deploy a valid certificate.",
                        phase="validation",
                        validation_kind="exploit",
                        exploit_attempted=True,
                        achieved="expired certificate confirmed",
                        artifact_paths=[str(log_path)],
                    )
                )
            elif days_left <= 14:
                findings.append(
                    self.make_finding(
                        type_="TLS certificate expires soon",
                        severity="medium",
                        endpoint=self.ctx.target_url,
                        description="The presented TLS certificate is close to expiry.",
                        confidence="high",
                        evidence=f"{days_left} day(s) remaining; notAfter={not_after}",
                        remediation="Renew the certificate before expiry.",
                        phase="validation",
                        validation_kind="evidence",
                        artifact_paths=[str(log_path)],
                    )
                )
        return log_path, findings


def _parse_cert_time(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
