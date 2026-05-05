# auto_scanner — Setup

> **Educational use only.** Only scan systems you own or have explicit written permission to test.

---

## 1. Python environment

```bash
cd <repo>/shoplab/auto_scanner
python3 -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

## 2. Install external tools

Run these once in WSL (Ubuntu/Debian) or any Linux environment:

```bash
# Web content discovery
sudo apt install dirb

# SQL injection tester
sudo apt install sqlmap            # or: pip install sqlmap

# Template-based scanner (binary release recommended)
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
nuclei -update-templates

# HTTP/CGI scanner
sudo apt install nikto

# OWASP ZAP (via Docker — no native install needed)
docker pull zaproxy/zap-stable

# (Optional) Browser-based crawl
pip install playwright && playwright install chromium
```

After installing, verify everything is on `PATH`:

```bash
python3 main.py --check-tools
```

> **nuclei via Go:** make sure `$GOPATH/bin` is on `PATH`.
> `export PATH="$HOME/.local/bin:$HOME/go/bin:$PATH"`

---

## 3. Start the target apps

**ShopLab** (runs on port 8080) — start from two terminals:

```bash
cd <repo>/shoplab
npm run dev:api        # terminal 1: API server
npm run dev:web        # terminal 2: frontend
```

**OWASP Juice Shop** (runs on port 3000):

```bash
docker run --rm -p 3000:3000 bkimminich/juice-shop
```

---

## 4. Run the scanner

From WSL, the app runs on Windows — resolve the reachable Windows host IP first:

```bash
WINHOST=$(ip route show default | awk '{print $3}')
curl -s "http://${WINHOST}:8080/api/health"   # should return {"status":"ok",...}
```

**ShopLab (port 8080):**

```bash
cd <repo>/shoplab/auto_scanner
source .venv/bin/activate
export PATH="$HOME/.local/bin:$HOME/go/bin:$PATH"
WINHOST=$(ip route show default | awk '{print $3}')

python3 main.py \
  --url "http://${WINHOST}:8080" \
  --accept-risk \
  --active \
  --zap-docker
```

**OWASP Juice Shop (port 3000):**

```bash
python3 main.py \
  --config scanner_config.juiceshop.json \
  --url "http://${WINHOST}:3000" \
  --accept-risk \
  --active \
  --zap-docker
```

Use `scanner_config.json` for ShopLab and `scanner_config.juiceshop.json` for Juice Shop — they are tuned for their respective apps.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `--check-tools` shows tools missing | Confirm they are on `PATH`; open a new terminal after editing `~/.bashrc` |
| No HTTP response / `discovery added 0` | Use `WINHOST=$(ip route show default ...)`, not `localhost`; verify with `curl` |
| `nuclei` finds zero templates | Run `nuclei -update-templates` |
| ZAP exits non-zero | Normal when findings exist — the scanner reads the JSON report regardless |
| Docker not found in WSL | Docker Desktop → Settings → Resources → WSL integration → enable your distro |
| `browser` scanner skipped | Install Playwright: `pip install playwright && playwright install chromium` |
