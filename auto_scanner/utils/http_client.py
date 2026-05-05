"""Small standard-library HTTP client for active scanner modules."""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from http.cookiejar import CookieJar
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import (
    HTTPCookieProcessor,
    HTTPRedirectHandler,
    Request,
    build_opener,
)


@dataclass
class HttpResponse:
    url: str
    status: int
    headers: Dict[str, str]
    body: str
    method: str = "GET"
    location: Optional[str] = None

    @property
    def lower_headers(self) -> Dict[str, str]:
        return {k.lower(): v for k, v in self.headers.items()}

    def json(self) -> Optional[Any]:
        try:
            return json.loads(self.body)
        except json.JSONDecodeError:
            return None

    @property
    def content_type(self) -> str:
        return self.lower_headers.get("content-type", "")

    @property
    def is_html(self) -> bool:
        return "html" in self.content_type.lower() or "<html" in self.body[:500].lower()

    @property
    def is_json(self) -> bool:
        return self.json() is not None

    @property
    def body_hash(self) -> str:
        return body_hash(self.body)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


class HttpClient:
    """Session-aware HTTP helper with conservative defaults."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout: int = 10,
        delay: float = 0.0,
        user_agent: str = "auto_scanner-active/1.0",
    ) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.timeout = timeout
        self.delay = max(0.0, delay)
        self.cookies = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.cookies))
        self.no_redirect_opener = build_opener(HTTPCookieProcessor(self.cookies), NoRedirect)
        self.user_agent = user_agent
        self._last_request = 0.0

    def resolve(self, path_or_url: str) -> str:
        if path_or_url.startswith(("http://", "https://")):
            return path_or_url
        return urljoin(self.base_url, path_or_url.lstrip("/"))

    def request(
        self,
        method: str,
        path_or_url: str,
        *,
        params: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None,
        json_body: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        follow_redirects: bool = True,
        max_bytes: int = 512_000,
    ) -> Optional[HttpResponse]:
        self._throttle()
        url = self.resolve(path_or_url)
        if params:
            sep = "&" if urlparse(url).query else "?"
            url = url + sep + urlencode(params, doseq=True)

        body: Optional[bytes] = None
        req_headers = {"User-Agent": self.user_agent, "Accept": "*/*"}
        if headers:
            req_headers.update(headers)
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        elif data is not None:
            body = urlencode(data, doseq=True).encode("utf-8")
            req_headers["Content-Type"] = "application/x-www-form-urlencoded"

        req = Request(url, data=body, headers=req_headers, method=method.upper())
        opener = self.opener if follow_redirects else self.no_redirect_opener
        try:
            with opener.open(req, timeout=self.timeout) as handle:
                raw = handle.read(max_bytes)
                return HttpResponse(
                    url=url,
                    status=int(handle.getcode() or 0),
                    headers=dict(handle.headers.items()),
                    body=raw.decode("utf-8", "replace"),
                    method=method.upper(),
                    location=handle.headers.get("Location"),
                )
        except HTTPError as exc:
            raw = exc.read(max_bytes)
            return HttpResponse(
                url=url,
                status=int(exc.code),
                headers=dict(exc.headers.items()),
                body=raw.decode("utf-8", "replace"),
                method=method.upper(),
                location=exc.headers.get("Location"),
            )
        except (TimeoutError, URLError, OSError):
            return None

    def get(self, path_or_url: str, **kwargs: Any) -> Optional[HttpResponse]:
        return self.request("GET", path_or_url, **kwargs)

    def post(self, path_or_url: str, **kwargs: Any) -> Optional[HttpResponse]:
        return self.request("POST", path_or_url, **kwargs)

    def options(self, path_or_url: str, **kwargs: Any) -> Optional[HttpResponse]:
        return self.request("OPTIONS", path_or_url, **kwargs)

    def login(self, auth_config: Dict[str, Any]) -> Tuple[bool, Optional[HttpResponse]]:
        if not auth_config or not auth_config.get("enabled"):
            return False, None
        login_path = str(auth_config.get("login_path") or "/login")
        method = str(auth_config.get("method") or "POST").upper()
        username_field = str(auth_config.get("username_field") or "email")
        password_field = str(auth_config.get("password_field") or "password")
        username = str(auth_config.get("username") or "")
        password = str(auth_config.get("password") or "")
        as_json = bool(auth_config.get("json", False))
        extra = auth_config.get("extra_fields") if isinstance(auth_config.get("extra_fields"), dict) else {}
        payload = {username_field: username, password_field: password, **extra}
        if not username or not password:
            return False, None
        if as_json:
            res = self.request(method, login_path, json_body=payload)
        else:
            res = self.request(method, login_path, data=payload)
        success = bool(res and 200 <= res.status < 400)
        return success, res

    def _throttle(self) -> None:
        if not self.delay:
            return
        elapsed = time.monotonic() - self._last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request = time.monotonic()


HREF_RE = re.compile(r"""(?:href|src|action)=["']([^"'#]+)["']""", re.I)
JS_ENDPOINT_RE = re.compile(r"""["'`]((?:/|https?://)[A-Za-z0-9_./?&=%:+\-{}]+)["'`]""")


def same_origin(url: str, base_url: str) -> bool:
    try:
        u = urlparse(url)
        b = urlparse(base_url)
    except ValueError:
        return False
    return (u.scheme, u.netloc) == (b.scheme, b.netloc)


def extract_html_urls(html: str, base_url: str) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in HREF_RE.findall(html or ""):
        url = urljoin(base_url, raw)
        if same_origin(url, base_url) and url not in seen:
            seen.add(url)
            out.append(url)
    return out


def extract_js_endpoints(source: str, base_url: str) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in JS_ENDPOINT_RE.findall(source or ""):
        url = urljoin(base_url, raw)
        if same_origin(url, base_url) and url not in seen:
            seen.add(url)
            out.append(url)
    return out


def interesting_json_keys(value: Any) -> List[str]:
    keys = set()
    stack: List[Any] = [value]
    while stack and len(keys) < 50:
        item = stack.pop()
        if isinstance(item, dict):
            keys.update(str(k) for k in item.keys())
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item[:20])
    return sorted(keys)


def json_contains_sensitive_keys(value: Any) -> List[str]:
    sensitive = re.compile(r"(password|token|secret|hash|role|admin|email|ssn|credit|card)", re.I)
    return [k for k in interesting_json_keys(value) if sensitive.search(k)]


def normalize_body(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "")
    text = re.sub(r"\b[0-9a-f]{8,}\b", "<hex>", text, flags=re.I)
    text = re.sub(r"\d{4,}", "<num>", text)
    return text.strip().lower()


def body_hash(text: str) -> str:
    return hashlib.sha256(normalize_body(text).encode("utf-8", "replace")).hexdigest()


def similar_body(a: str, b: str, *, threshold: float = 0.92) -> bool:
    a_norm = normalize_body(a)
    b_norm = normalize_body(b)
    if not a_norm or not b_norm:
        return False
    if a_norm == b_norm:
        return True
    shorter = min(len(a_norm), len(b_norm))
    longer = max(len(a_norm), len(b_norm))
    if shorter / max(longer, 1) < threshold:
        return False
    prefix_len = 0
    for left, right in zip(a_norm, b_norm):
        if left != right:
            break
        prefix_len += 1
    return (prefix_len / longer) >= threshold


def is_spa_fallback(response: Optional[HttpResponse], baseline: Optional[HttpResponse] = None) -> bool:
    if not response or not response.is_html:
        return False
    lower = response.body[:2000].lower()
    spa_markers = (
        "<app-root",
        "<div id=\"root\">",
        "<div id='root'>",
        "main.js",
        "polyfills.js",
        "data-beasties-container",
        "vite",
        "nuxt-",
        "next-route-announcer",
    )
    if not any(marker in lower for marker in spa_markers):
        return False
    if baseline and similar_body(response.body, baseline.body, threshold=0.80):
        return True
    return False


ENV_SIGNATURE_RE = re.compile(
    r"(?m)^[A-Z0-9_]{3,}\s*=\s*.+|DATABASE_URL=|API_KEY=|SECRET=|TOKEN=",
    re.I,
)
GIT_CONFIG_SIGNATURE_RE = re.compile(r"(?m)^\s*\[(core|remote|branch)\]|repositoryformatversion\s*=", re.I)
PACKAGE_JSON_SIGNATURE_RE = re.compile(r'"(name|version|dependencies|devDependencies|scripts)"\s*:')


def sensitive_file_signature(path: str, response: Optional[HttpResponse], baseline: Optional[HttpResponse] = None) -> Optional[str]:
    if not response or response.status != 200:
        return None
    if is_spa_fallback(response, baseline):
        return None
    path_l = path.lower()
    body = response.body[:20_000]
    ctype = response.content_type.lower()
    if path_l.endswith(".env") or path_l.endswith("/.env"):
        return "env-style key/value secrets" if ENV_SIGNATURE_RE.search(body) else None
    if ".git/config" in path_l:
        return "git config markers" if GIT_CONFIG_SIGNATURE_RE.search(body) else None
    if path_l.endswith(".zip"):
        return "zip archive response" if body.startswith("PK") or "zip" in ctype else None
    if path_l.endswith((".json", ".json.bak", "package.json.bak", "package-lock.json.bak")):
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            return "package metadata markers" if PACKAGE_JSON_SIGNATURE_RE.search(body) else None
        if isinstance(parsed, dict) and any(k in parsed for k in ("name", "version", "dependencies", "scripts", "lockfileVersion")):
            return "package metadata JSON"
    if path_l.endswith((".bak", ".old", ".backup")) and not response.is_html and len(body.strip()) > 20:
        return "backup file content"
    return None


def paths_from_openapi(doc: Any, base_url: str) -> List[str]:
    if not isinstance(doc, dict) or not isinstance(doc.get("paths"), dict):
        return []
    return [urljoin(base_url, str(path).lstrip("/")) for path in doc["paths"].keys()]


_ROUTE_METHOD_PREFIX = re.compile(
    r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(/[^\s]+)",
    re.I,
)


def urls_from_route_catalog(doc: Any, base_url: str) -> List[str]:
    """Collect absolute URLs from nested JSON where strings look like ``GET /api/foo``.

    Some APIs ship a public ``/api`` JSON blob that lists routes as method + path
    strings; this expands those into crawlable URLs for downstream scanners.
    """

    if not isinstance(doc, dict):
        return []
    base = base_url.rstrip("/") + "/"
    seen: List[str] = []

    def walk(obj: Any) -> None:
        if isinstance(obj, dict):
            for value in obj.values():
                walk(value)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)
        elif isinstance(obj, str):
            text = obj.strip()
            match = _ROUTE_METHOD_PREFIX.match(text)
            if not match:
                return
            path = match.group(2)
            if not path.startswith("/"):
                return
            absolute = urljoin(base, path.lstrip("/"))
            if absolute not in seen:
                seen.append(absolute)

    walk(doc)
    return seen


def route_catalog_suggests_privileged_paths(doc: Any) -> bool:
    """Heuristic: serialized catalog mentions admin, flag, or internal-only paths."""

    if not isinstance(doc, dict):
        return False
    blob = json.dumps(doc).lower()
    markers = (
        "/admin",
        "admin/flag",
        "/internal",
        "/debug",
        '"admin"',
        "/account/settings",
        "/coupons/",
    )
    return any(m in blob for m in markers)
