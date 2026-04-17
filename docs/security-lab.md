# Security Lab Notes

ShopLab is designed for security education. The codebase ships with sensible defaults (parameterized SQL, validation middleware, auth checks). Intentional weaknesses are introduced in dedicated challenge files so the baseline template stays secure.

## Included Challenge — Operation: Phantom Checkout

**Category:** A01:2025 Broken Access Control | **Difficulty:** Medium

A three-stage exploit chain built on real API endpoints:

| Stage | Vulnerability | Endpoint | What leaks |
|-------|--------------|----------|------------|
| 1 | IDOR (CWE-639) | `GET /api/orders/:id/receipt` | Staff notes containing an internal coupon code |
| 2 | Missing function-level access control (CWE-285) | `POST /api/coupons/apply` | Debug response exposing an admin promo key |
| 3 | Mass assignment / privilege escalation (CWE-269) | `PATCH /api/account/settings` | Role promoted to admin via unsanitized body field + promo key header |

After escalation, `GET /api/admin/flag` returns the flag. Students submit it on the Challenges page.

The Lab page (`/lab`) guides students through the stages with objectives, clues, and evidence submission.

## Common Exercise Themes

1. SQL injection
2. XSS
3. Authentication bypass
4. Authorization bypass (included)
5. IDOR (included)
6. Input validation bypass
7. Information disclosure
8. Privilege escalation (included)

## Challenge Endpoints

- `GET /api/challenges`
- `POST /api/challenges/solve`
- `POST /api/challenges/:slug/interact`
- `GET /api/hints`
- `GET /api/hints/:slug`

## Challenge Authoring Workflow

1. Add a definition file under `apps/api/src/challenges/definitions/`.
2. Register the definition in `apps/api/src/challenges/registry.js`.
3. Keep metadata, hints, learning objectives, panel config, and optional live-surface metadata together in that file.
4. Add an interaction handler only if the challenge needs a simulator or custom server-side action.
5. Add a matching frontend panel only when the generic flag-submit flow is not enough, then register its `panel.kind` in `apps/web/src/components/challenge-panels/` (see any panel module you add there).
6. If the challenge needs a dedicated live route, add the page/route in the web app and point `surface.route` to it.
7. Verify the challenge list, hints, interactive surface, and solve flow after restarting the apps.
