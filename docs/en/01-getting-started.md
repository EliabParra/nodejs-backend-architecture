# 01 — Run the project

## Requirements

- Node.js (ESM project: `"type": "module"`) see [package.json](../../package.json)
- PostgreSQL (credentials via `.env` / environment variables; see [docs/en/03-configuration.md](03-configuration.md))

## Install

1. `npm install`
2. Set up the DB and the `security` schema (see [docs/en/04-database-security-model.md](04-database-security-model.md)).
3. Copy [\.env.example](../../.env.example) to `.env` and set `PG*` or `DATABASE_URL`.

> Note: [src/config/config.json](../../src/config/config.json) keeps `CHANGE_ME` placeholders so real secrets are not committed.

## Users and passwords (bcrypt)

Login no longer compares plaintext passwords. In `security.user.user_pw` you must store a **bcrypt hash**.

- Generate a hash:
	- `npm run hashpw -- "MyStrongPassword123"`
	- (optional) rounds: `npm run hashpw -- "MyStrongPassword123" 10`

Then store that hash as `user_pw` in the `security.user` table.

## Run

- Normal: `npm start` (runs [src/index.js](../../src/index.js))
- Dev: `npm run dev` (nodemon)

## Deployment (production)

In production you typically run the backend with:

- `npm start`

And configure secrets/DB via environment variables (see [03-configuration.md](03-configuration.md)).

### Checks (health and readiness)

- `GET /health`: liveness (process is up) → expected `200`
- `GET /ready`: readiness (dependencies OK) → `200` when DB + security are ready; otherwise `503`

See details in [05-api-contract.md](05-api-contract.md).

### Scenario A — Separate frontend (recommended, API-only)

1. On the backend: `APP_FRONTEND_MODE=none`.
2. Deploy the frontend on its own hosting (Vercel/Netlify/S3+CloudFront/etc.).
3. Configure CORS for your frontend domain (see `config.cors.*` in [03-configuration.md](03-configuration.md)).
4. If you use cookie-based sessions cross-origin, review `SESSION_COOKIE_SECURE` / `SESSION_COOKIE_SAMESITE`.

### Scenario B — Backend serving the SPA build

1. Build your frontend (in the frontend repo): `npm run build`.
2. On the backend:
	- `APP_FRONTEND_MODE=spa`
	- `SPA_DIST_PATH=<folder that contains index.html>`
3. Start the backend with `npm start`.

The backend will serve static build assets and fall back to `index.html` for SPA routes.

### (Optional) start backend + frontend together

If your team wants a single command to start both (without coupling the backend to any specific framework), use:

- `npm run full`

> Note: `npm run full` is a development helper only, not a production pattern.

In backend `.env` set:

- `FRONTEND_PATH=...` (path to the frontend repo containing `package.json`)
- (optional) `FRONTEND_SCRIPT=start`
- (optional) `BACKEND_SCRIPT=dev`

To connect any frontend, see [10-frontend-clients-and-requests.md](10-frontend-clients-and-requests.md).

When running, the server always exposes:

- `POST /login`
- `POST /logout`
- `POST /toProccess` (transaction dispatcher)

Page routes (`/` and `/content`) depend on the mode:

- `APP_FRONTEND_MODE=none` (default): serves **no** pages (API-only).
- `APP_FRONTEND_MODE=pages`: serves [public/pages/index.html](../../public/pages/index.html) and the protected page.
- `APP_FRONTEND_MODE=spa`: serves a SPA build from `SPA_DIST_PATH` and falls back to `index.html`.

These endpoints are defined in [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js). The pages router (pages mode) is in [src/router/pages.js](../../src/router/pages.js).

## Quick manual smoke-test

1. Open `http://localhost:3000/` (only if `APP_FRONTEND_MODE=pages` or `spa`)
2. Login (button “Ingresar”).
3. Try the Person CRUD demo (Get/Create/Update/Delete).

The example frontend uses `fetch` against `/login`, `/logout`, and `/toProccess` (see [public/js/Sender.js](../../public/js/Sender.js) and [public/js/scripts.js](../../public/js/scripts.js)).
