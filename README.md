# ShopLab

ShopLab is a course-ready e-commerce security template with a typed React frontend, an Express API, per-user challenge progress, and a file-driven challenge registry.

## Structure

```text
shoplab/
  apps/
    web/        # Vite + React + TypeScript frontend
    api/        # Express API
  database/     # PostgreSQL schema and API seed data
  docs/         # Setup, architecture, and challenge-authoring docs
```

## Quick Start

1. Install app dependencies: `npm run bootstrap`
2. Copy `apps/api/.env.example` to `apps/api/.env` and update the database values.
3. Create the database and load `database/schema.sql`.
4. Start the API: `npm run dev:api`
5. Start the web app in another terminal: `npm run dev:web`

The frontend runs on `http://localhost:8080` and proxies `/api` requests to the API on `http://localhost:3001`.

## What Is Included

- A realistic storefront shell for web-security training
- A file-driven challenge registry in `apps/api/src/challenges`
- Per-user challenge progress stored in PostgreSQL
- Challenge hints and flag submission, all API-backed
- **One built-in challenge: *Operation: Phantom Checkout*** — chain IDOR, missing function-level auth, and privilege escalation via mass assignment against the real application endpoints

## Template Notes

- Auth, challenge metadata, hints, and progress tracking are API-backed.
- Challenges are solved against the real app (browser devtools, curl, Postman). There is no helper stepper UI.
- Storefront product IDs in `apps/web/src/data/mockData.ts` are kept in sync with the DB seed via `productService.ensureSeed()` on startup, so orders, reviews, and cart checkouts resolve real product rows.

## Add A New Challenge

1. Create a definition under `apps/api/src/challenges/definitions/`.
2. Register it in `apps/api/src/challenges/registry.js`.
3. Add any required intentionally-vulnerable endpoints to the real API surface.
4. Restart the API and web app, then verify listing, hints, and flag submission flow.

## Docs

- `docs/setup.md`
- `docs/architecture.md`
- `docs/security-lab.md`
