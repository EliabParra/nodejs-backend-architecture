# 01 — Run the project

## Requirements

- Node.js (ESM project: `"type": "module"`) see [package.json](../../package.json)
- PostgreSQL (credentials via `.env` / environment variables; see [docs/en/03-configuration.md](03-configuration.md))

## Install

1. `npm install`
2. Set up the DB and create the `security` schema (recommended: `npm run db:init`, see [docs/en/10-db-init-cli.md](10-db-init-cli.md)).
3. Copy [\.env.example](../../.env.example) to `.env` and set `PG*` or `DATABASE_URL`.

> Note: [src/config/config.json](../../src/config/config.json) keeps `CHANGE_ME` placeholders so real secrets are not committed.

## Users and passwords (bcrypt)

Login no longer compares plaintext passwords. In `security.users.password` you must store a **bcrypt hash**.

- Generate a hash:
    - `npm run hashpw -- "MyStrongPassword123"`
    - (optional) rounds: `npm run hashpw -- "MyStrongPassword123" 10`

Then store that hash as `password` in the `security.users` table.

## Run

- Normal: `npm start` (runs [src/index.ts](../../src/index.ts))
- Dev: `npm run dev` (nodemon)

## End-to-end workflow (copy/paste)

Goal: initialize the DB, create a BO, register its tx mapping + permissions, and execute it via `/toProccess`.

### 1) Initialize DB (schema + session table)

```bash
npm run db:init
```

If you want to preview the SQL without touching the DB:

```bash
npm run db:init -- --print
```

### 2) Create a BO (files)

```bash
npm run bo -- new Order --methods getOrder,createOrder
```

### 3) Sync BO methods to DB (tx mapping)

```bash
npm run bo -- sync Order --txStart 200
```

To see the resulting mapping:

```bash
npm run bo -- list
```

### 4) Grant permissions to a profile

Example (profile `1`):

```bash
npm run bo -- perms --profile 1 --allow Order.getOrder,Order.createOrder
```

### 5) Start the server and verify readiness

```bash
npm start
```

In another terminal:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

### 6) Login and call `/toProccess` (cookies + CSRF)

This backend uses cookie sessions, so you need:

- a cookie jar
- a CSRF token

```bash
# 1) Login (stores cookies in cookies.txt)
curl -sS -c cookies.txt -b cookies.txt \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"CHANGE_ME"}' \
    http://localhost:3000/login

# 2) Get CSRF token (requires session cookie)
curl -sS -c cookies.txt -b cookies.txt http://localhost:3000/csrf
```

Copy the `csrfToken` value from the `/csrf` response, then call `/toProccess`:

```bash
curl -sS -c cookies.txt -b cookies.txt \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: <paste_csrfToken_here>" \
    -d '{"tx":200,"params":{}}' \
    http://localhost:3000/toProccess
```

Notes:

- `tx` values are project-specific. Use `npm run bo -- list` to find the tx for `Order.getOrder`.
- Permissions/tx mappings are cached at startup; after DB changes, restart the server.

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

Run backend and frontend separately in development (backend: `npm run dev`).

To connect any frontend, see [11-frontend-clients-and-requests.md](11-frontend-clients-and-requests.md).

When running, the server always exposes:

- `POST /login`
- `POST /logout`
- `POST /toProccess` (transaction dispatcher)

Page routes (`/` and `/content`) depend on the mode:

- `APP_FRONTEND_MODE=none` (default): serves **no** pages (API-only).
- `APP_FRONTEND_MODE=pages`: serves static pages from `public/pages/`.
- `APP_FRONTEND_MODE=spa`: serves a SPA build from `SPA_DIST_PATH` and falls back to `index.html`.

These endpoints are defined in [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts). The pages router (pages mode) is in [src/router/pages.ts](../../src/router/pages.ts).

## Quick manual smoke-test

1. Open `http://localhost:3000/` (only if `APP_FRONTEND_MODE=pages` or `spa`).
2. Login.
3. Call your own BO methods via `POST /toProccess` using a `tx` mapped in the `security` schema.

If you enable `pages` mode, add your own files under `public/pages/`.
