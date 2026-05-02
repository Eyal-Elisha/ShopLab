# Setup & Handoff

This project ships two running modes:

- **Development** — two processes on two ports (Vite on `8080`, Express API on `3001`) with hot reload.
- **Production / handoff** — one process on one port. Express serves both the built frontend and the API. This is the mode you should use when giving the app to someone to solve.

---

## 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or reachable via `DB_HOST`)
- `npm`
- **[Ollama](https://ollama.com)** — only if you use the Help & support widget / LLM challenge. Put **`OLLAMA_MODEL=llama3.2`** (or matching tag) in **`apps/api/.env`** after **`ollama pull llama3.2`**. See **§10** below.

---

## 2. Database

```bash
createdb ecommerce_lab
psql -d ecommerce_lab -f database/schema.sql
```

The schema seeds the admin user, the storefront products (kept in sync with `apps/web/src/data/mockData.ts`), and the coupons table. Challenge-support tables (`coupons`, the `staff_notes` column on `orders`, `user_challenge_progress`) are also created at runtime on first boot via the API's `ensureTables()` / `ensureSeed()` calls, so you do not need to re-run `schema.sql` after upgrades.

---

## 3. Environment files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` and set at minimum:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ecommerce_lab
DB_USER=postgres
DB_PASSWORD=...
JWT_SECRET=<something-long-random>
PORT=3001
NODE_ENV=production        # for single-port handoff mode
CORS_ORIGIN=http://localhost:3001
```

`CORS_ORIGIN` only matters when the web UI and API are on different origins. In single-port mode they share an origin and CORS is a no-op.

---

## 4. Install

Run once from the repo root:

```bash
npm run bootstrap
```

This installs dependencies for both `apps/web` and `apps/api`.

---

## 5. Development mode (two ports, hot reload)

In two terminals:

```bash
# terminal 1 — API
npm run dev:api          # http://localhost:3001

# terminal 2 — web
npm run dev:web          # http://localhost:8080
```

Open `http://localhost:8080`. Vite proxies `/api/*` to the API automatically, so from the browser's perspective everything is on port 8080. You never need to remember the API port in dev.

---

## 6. Production / handoff mode (single port)

From the repo root:

```bash
npm start
```

This:

1. Builds the frontend to `apps/web/dist`.
2. Boots the API on `PORT` (default `3001`).
3. The API detects the built frontend and serves it statically from the same port, with an SPA fallback so client-side routes (e.g. `/challenges`) still work on refresh.

Open **`http://localhost:3001`** and the entire app is there. There is no second port. This is the URL you hand to a player.

To re-run without rebuilding the frontend:

```bash
npm run start:api
```

---

## 7. Accounts

Seeded admin (present for sanity-check only — the challenge assumes you do **not** log in as this user):

- username: `admin`
- email: `admin@shop.local`
- password: `admin123`

Register a new account from the web UI. That is the account you use to attempt the challenge. The exploit chain starts from a regular user and ends with that same user promoted to admin.

---

## 8. Handing this off to someone to solve

The minimum a player needs from you:

1. A running instance (or the repo + these instructions).
2. One URL — the single-port URL from step 6.
3. A directive: *"Register an account, then become admin and submit the flag on the Challenges page."*

That is it. The player does not need to know the API port, the database credentials, or the layout of the source tree. All the discovery surface they need is reachable from the one URL:

- Browsable storefront, cart, account, and challenges pages.
- A `/robots.txt` with breadcrumbs to endpoints the UI doesn't expose.
- A `/api` root that catalogs every endpoint the backend serves.
- HTML source containing a dev comment pointing at the above.

### Deploying somewhere public

For a real handoff over the internet you have two easy options.

**Option A — single VPS / container.** Run Postgres, set `NODE_ENV=production`, then `npm start`. Put Nginx or Caddy in front to terminate TLS and forward to `http://localhost:3001`. Done.

**Option B — PaaS (Render, Railway, Fly, etc.).** Add a managed Postgres, point `DB_*` at it, set the start command to `npm start`, and expose the web port. Each of these providers will give you a single public URL that is the deploy URL.

Do not expose the Postgres port publicly; only the app port needs to be reachable.

---

## 9. Resetting state between players

The seeded data is idempotent (`productService.ensureSeed()` and `couponService.ensureTables()` both upsert / no-op on existing rows), but challenge progress and user accounts persist across restarts. To reset cleanly between players:

```bash
dropdb ecommerce_lab && createdb ecommerce_lab && psql -d ecommerce_lab -f database/schema.sql
```

Or, less destructively, just truncate the user-generated tables:

```sql
TRUNCATE user_challenge_progress, order_items, orders, reviews, cart_items RESTART IDENTITY CASCADE;
DELETE FROM user_roles WHERE user_id > 1;
DELETE FROM users WHERE id > 1;
```

Then re-seed the staff-notes order if you want it back:

```sql
SELECT id FROM orders WHERE staff_notes IS NOT NULL LIMIT 1;
-- if empty, restart the API once; ensureTables() will reinsert it.
```

---

## 10. Ollama (support chat / LLM challenge)

The support chat API talks to **only** Ollama. In **`apps/api/.env`** set **`OLLAMA_MODEL`** — this repo assumes **`llama3.2`** after `ollama pull llama3.2` (whatever `ollama list` prints must match).

- **`OLLAMA_MODEL`** — typically `llama3.2` here; adjust if you pulled a different tag.
- Optional overrides (omit to use defaults): `OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`, `OLLAMA_TIMEOUT_MS` defaults to `120000` (ms).

The challenge flag string is baked into code (same source as **Challenges**); it is **not** set via `.env`. Learners retrieve it indirectly (prompt injection vs. model behavior).

### Start Ollama

- **Windows / macOS:** install the Ollama app and open it once. It runs a background service that listens on port **11434**. You can quit from the tray/menu bar and reopen later the same way.
- **Linux / headless:** run `ollama serve` in a terminal and leave it running.

### Pull a model (once per model name)

```bash
ollama pull llama3.2
```

Use the same name in `OLLAMA_MODEL` as shown by `ollama list`.

### Check that it responds

```bash
ollama run llama3.2 "Say hi in one sentence."
```

Or: open `http://127.0.0.1:11434` in a browser — you should get `Ollama is running`.

Restart the ShopLab API after changing `.env`. If the chat errors with **503**, `OLLAMA_MODEL` is missing; if **502**, Ollama is not running, the model is not pulled, or the URL is wrong.

If each reply feels slow (**10–30 s on CPU-only** is common): the API sends `keep_alive` and caps decode length / context (`OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_PREDICT`, `OLLAMA_NUM_CTX` in `.env`). Use an NVIDIA GPU (Ollama must see CUDA on Windows), or pull a smaller tag such as **`llama3.2:3b`**, send one warm‑up prompt after restarting Ollama, and close RAM-heavy apps.
