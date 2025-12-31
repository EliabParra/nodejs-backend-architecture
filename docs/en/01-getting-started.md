# 01 — Run the project

## Requirements

- Node.js (ESM project: `"type": "module"`) see [package.json](../../package.json)
- PostgreSQL (credentials via `.env` / environment variables; see [docs/en/03-configuration.md](03-configuration.md))

## Install

1. `npm install`
2. Set up the DB and create the `security` schema (recommended: `npm run db:init`, see [docs/en/11-db-init.md](11-db-init.md)).
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

## Development (watch) with backend + SPA separated

Goal: run **backend** and **SPA frontend** on different ports, both in watch/hot-reload mode, and let the **frontend** own the SPA routes.

### Recommended: use the frontend dev-server proxy (no CORS in the browser)

This avoids cookie/CORS issues in dev because the browser only talks to the frontend dev server, which proxies API calls to the backend.

1. Backend (API-only):
	- In `.env`: `APP_FRONTEND_MODE=none`
	- Run: `npm run dev` (port `APP_PORT`, default `3000`)
2. Frontend (Angular example):
	- Run in the frontend repo: `npm start`
	- The script already uses `ng serve --proxy-config proxy.conf.json`.
	- Make sure the frontend calls the API using relative paths: `/csrf`, `/login`, `/logout`, `/toProccess`.

### Alternative: direct CORS (frontend calls http://localhost:3000)

Useful if you want to test a more “production-like” cross-origin setup (cookies/headers) during development.

1. Backend:
	- `cors.enabled=true`, `cors.credentials=true`
	- add `http://localhost:4200` (or your port) to `cors.origins`
2. Frontend:
	- Call `http://localhost:3000/...`
	- Send cookies with `credentials: 'include'`
	- For `POST`, send `X-CSRF-Token` (see [05-api-contract.md](05-api-contract.md))

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
- (optional) `FRONTEND_ARGS=...` (e.g. `--port 4201` to avoid `4200` conflicts)
- (optional) `BACKEND_SCRIPT=dev`
- (optional) `BACKEND_ARGS=...`
- (optional) `FULL_KEEP_ALIVE=true`

To connect any frontend, see [10-frontend-clients-and-requests.md](10-frontend-clients-and-requests.md).

When running, the server always exposes:

- `POST /login`
- `POST /logout`
- `POST /toProccess` (transaction dispatcher)

Page routes (`/` and `/content`) depend on the mode:

- `APP_FRONTEND_MODE=none` (default): serves **no** pages (API-only).
- `APP_FRONTEND_MODE=pages`: serves static pages from `public/pages/` (see examples in [docs/en/11-examples.md](11-examples.md)).
- `APP_FRONTEND_MODE=spa`: serves a SPA build from `SPA_DIST_PATH` and falls back to `index.html`.

These endpoints are defined in [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js). The pages router (pages mode) is in [src/router/pages.js](../../src/router/pages.js).

## Quick manual smoke-test

1. Open `http://localhost:3000/` (only if `APP_FRONTEND_MODE=pages` or `spa`).
2. Login.
3. Call your own BO methods via `POST /toProccess` using a `tx` mapped in the `security` schema.

If you want a working end-to-end demo (BOs + sample SQL), use the example under [examples/bo-demo](../../examples/bo-demo).

The built-in pages (when `APP_FRONTEND_MODE=pages`) use `fetch` against `/login`, `/logout`, and `/toProccess`.
To inspect the included demo client/pages, see [docs/en/11-examples.md](11-examples.md).
