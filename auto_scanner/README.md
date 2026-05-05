# auto_scanner

Generic web vulnerability scanner orchestrator. Combines focused Python probes with established external tools (`dirb`, `sqlmap`, `nuclei`, `nikto`, OWASP ZAP) and merges every finding into a single de-duplicated JSON + HTML report.

> **Educational use only.** Only scan systems you own or have explicit written authorisation to test.

---

## What it does

1. **Discovers** endpoints — hits the root, `/api`, `/robots.txt`, `/sitemap.xml`, reads HTML/JS/OpenAPI, and walks any public route catalog.
2. **Probes** the attack surface — HTTP security headers, CORS reflection, cookie attributes, JWT weaknesses, SQL/XSS error echoes, BOLA/IDOR, mass-assignment, open redirects.
3. **Runs authenticated probes** — registers a throwaway account, mines harvested secrets, attempts privilege escalation, forges opaque session cookies, exploits business logic (price manipulation, BFLA, JWT alg=none).
4. **Runs external scanners** — `dirb`, `sqlmap`, `nuclei`, `nikto`, and OWASP ZAP on the discovered endpoint list.
5. **Reports** — every finding gets an OWASP label (Web 2025 / API 2023 / LLM 2025) and lands in a dark-themed HTML report with a coverage matrix.

---

## Quick start

```bash
python main.py --check-tools                        # verify which tools are installed
python main.py --url http://TARGET:PORT             # basic passive scan
python main.py --url http://TARGET:PORT \           # full active lab scan
  --accept-risk --active --zap-docker
```

See [`setup.md`](./setup.md) for installing external tools and starting the target apps.

---

## Key CLI flags

| Flag | Description |
|------|-------------|
| `--url URL` | Target URL (required) |
| `--config FILE` | JSON config file (default: `scanner_config.json`) |
| `--accept-risk` | Required for non-loopback targets |
| `--active` | Enable active Web/API attack probes |
| `--zap-docker` | Run OWASP ZAP via Docker |
| `--skip TOOL` | Disable a specific scanner |
| `--only TOOL` | Run only one scanner |
| `--experimental-auth` | Enable destructive opt-in probes (JWT alg=none, cookie forgery) |
| `--check-tools` | Print tool availability and exit |

---

## Output

Each run creates `results/<timestamp>_<host>/`:

```
scanner.log         full DEBUG log
endpoints.json      all discovered URLs
surface_model.json  normalized attack surface model
attack_plan.json    what ran and what was skipped (with reasons)
report.json         all findings, de-duplicated
report.html         HTML report with OWASP coverage matrix
raw/                per-scanner raw output
```

---

## Configuration

Copy `scanner_config.example.json` to `scanner_config.json` and edit. Key options:

| Key | Effect |
|-----|--------|
| `profile` | `fast`, `full`, `active-lab`, `api-focused`, `passive-only` |
| `scanners.*` | Enable/disable individual scanners |
| `extra_endpoints` | Seed URLs to add on top of auto-discovery |
| `experimental_auth` | Mirrors `--experimental-auth` |
| `zap_docker` | Mirrors `--zap-docker` |
| `stateful.*` | Registration/login paths and payloads for the authenticated probe suite |

---

## Extending

Subclass `scanners.base.BaseScanner`, implement `run() → (raw_path, [findings])`, and register it in `SCANNER_REGISTRY` in `main.py`. Use `make_finding(...)` for the unified schema and `utils.owasp_taxonomy.label(...)` for OWASP categories.
