# 03 — Config, messages and queries

## Where config lives

Loaded at startup in [src/globals.js](../../src/globals.js) via `createRequire()`:

- `config` from [src/config/config.json](../../src/config/config.json)
- `queries` from [src/config/queries.json](../../src/config/queries.json)
- `msgs` from [src/config/messages.json](../../src/config/messages.json)

Exposed globally as `globalThis.config`, `globalThis.queries`, `globalThis.msgs`.

## Environment variable overrides (recommended)

To avoid hardcoding secrets (DB password, `session.secret`, etc.), the runtime supports overriding `config.json` via `process.env`.

In this repo, [src/config/config.json](../../src/config/config.json) keeps "placeholder" values (`CHANGE_ME`) so real secrets are not committed.

- Locally, copy [\.env.example](../../.env.example) to `.env`.
- In production, set these variables in your platform (Render/Docker/K8s/etc.).

Supported variables:

- App: `APP_PORT`, `APP_HOST`, `APP_LANG`
- Frontend hosting (optional):
  - `APP_FRONTEND_MODE`: `pages` | `spa` | `none`
    - `pages`: backend serves HTML from `public/pages` (legacy mode)
    - `spa`: backend serves a SPA build and falls back to `index.html` (frontend owns routes)
    - `none`: backend serves no pages (API-only) (**default**, to stay decoupled)
  - `SPA_DIST_PATH` (spa mode only): path to frontend output (folder containing `index.html`)
- Postgres: `DATABASE_URL` or `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSL`
- Session (rotation): `SESSION_SECRET` or `SESSION_SECRETS` (comma-separated)
  - Example: `SESSION_SECRETS=current_secret,previous_secret`
- Session store (optional): `SESSION_SCHEMA`, `SESSION_TABLE`
  - Useful if you want the session table to live under another schema (e.g. `security`).
- Cookies (optional): `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_MAXAGE_MS`

Extra variables (production / reverse proxy):

- `APP_TRUST_PROXY`: configures Express `app.set('trust proxy', ...)` (useful behind a proxy/LB).
  - Common values: `1` (one proxy), `true` (trust all; use with care).
- CORS via env (optional):
  - `CORS_ENABLED=true|false`
  - `CORS_CREDENTIALS=true|false`
  - `CORS_ORIGINS=https://my-frontend.example,https://admin.my-frontend.example`

Logging (optional):

- `LOG_FORMAT=text|json`
  - `text` (default): human-friendly colored logs.
  - `json`: one-line JSON per event (recommended for production log aggregation).

## config.json

File: [src/config/config.json](../../src/config/config.json)

- `app.port`, `app.host`: Express bind address
- `app.lang`: active language (`"es"` or `"en"`)
- `app.frontendMode`: `"pages"` | `"spa"` | `"none"` (see above)
- `app.bodyLimit` (optional): request size limit for JSON/urlencoded bodies (e.g. `"100kb"`, `"1mb"`).
- `db`: `pg.Pool` settings (used by [src/BSS/DBComponent.js](../../src/BSS/DBComponent.js))
- `session`: `express-session` settings (used by [src/BSS/Session.js](../../src/BSS/Session.js))
- `bo.path`: relative path used by `Security` to dynamically import BO modules (see [src/BSS/Security.js](../../src/BSS/Security.js))
- `log.activation`: flags per log level (error/info/debug/warn) used by [src/BSS/Log.js](../../src/BSS/Log.js)
- `log.format` (optional): `"text"` | `"json"` (can be overridden via `LOG_FORMAT`)

Note: with `info` enabled, the server also logs successful requests (2xx/3xx) with `requestId` and `durationMs` (see [docs/en/05-api-contract.md](05-api-contract.md)).

### CORS (frontend frameworks on another port)

Config: [src/config/config.json](../../src/config/config.json) → `cors`

- `cors.enabled`: enables the CORS middleware.
- `cors.credentials`: allows cookies/session cross-origin (needed if the frontend runs on a different origin).
- `cors.origins`: allowlist of dev origins (e.g. Vite `http://localhost:5173`, Angular `http://localhost:4200`).

Implementation: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

Note (CSRF): for `POST` requests you must send the `X-CSRF-Token` header (see [docs/en/05-api-contract.md](05-api-contract.md)).

### Cookies + CORS in production (quick guide)

- If frontend and backend are on **different domains** and you use cookie-based sessions:
  - frontend: `credentials: 'include'` / `withCredentials: true`
  - backend: `cors.credentials=true` and `cors.origins` must allowlist the real frontend domain(s)
  - cookie:
    - `SESSION_COOKIE_SECURE=true` (HTTPS)
    - `SESSION_COOKIE_SAMESITE=none` (cross-site)
  - behind a proxy/LB: set `APP_TRUST_PROXY=1` (or appropriate value) so Express can detect HTTPS and support `secure` cookies.

- If frontend and backend share the **same domain** (same “site”), `SESSION_COOKIE_SAMESITE=lax` is usually enough.

### Security headers (helmet)

The server applies standard security headers via `helmet` and disables `X-Powered-By`.

Implementation: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

## Backend pages vs SPA frontend

You can choose who “owns” routes:

- `none` (default / recommended): API-only (serves no pages).
- `pages`: Express serves pages from `public/pages` (routes in `src/router/routes.js`).
- `spa`: Express serves a SPA build (React/Angular/Vue/etc.) and falls back to `index.html` for non-API routes.

Main scripts in `package.json`:

- `npm start`: production (uses `.env`/env vars)
- `npm run dev`: development (nodemon)
- `npm run full`: optional dev helper (starts backend + frontend via `FRONTEND_PATH`)

For `spa`, the backend deliberately has NO default dist folder (to stay decoupled). You must set `SPA_DIST_PATH` or `config.app.spaDistPath`. If missing, the backend prompts on startup (interactive terminals only).

### Extra variables for `npm run full` (optional)

- `FRONTEND_PATH`: path to the frontend repo (must contain `package.json`).
- `FRONTEND_SCRIPT` (default `start`): which npm script to run in the frontend.
- `FRONTEND_ARGS` (optional): extra args passed to the frontend script.
  - Passed as: `npm run <FRONTEND_SCRIPT> -- <FRONTEND_ARGS>`
  - Example (Angular, avoid port 4200 conflicts): `FRONTEND_ARGS=--port 4201`
- `BACKEND_SCRIPT` (default `dev`): which npm script to run in the backend.
- `BACKEND_ARGS` (optional): extra args passed to the backend script (same `--` pattern).
- `FULL_KEEP_ALIVE=true|false` (optional): when `true`, don't auto-shutdown the other process when one exits.

## messages.json

File: [src/config/messages.json](../../src/config/messages.json)

Per-language structure:

- `logs`: labels
- `errors.server`: internal server errors (500, txNotFound, dbError, ...)
- `errors.client`: usage/auth errors (401 login required, permissionDenied, invalidParameters, ...)
- `success`: success messages (login/logout/create/update/delete)
- `alerts`: templates used by `Validator`

Code selects messages with `msgs[config.app.lang]`.

## queries.json

File: [src/config/queries.json](../../src/config/queries.json)

Shape:

```json
{
  "<schema>": {
    "<queryName>": "SQL ..."
  }
}
```

Current schemas:

- `security`: **definitive** schema for auth/roles/tx/permissions.
- `enterprise`: example schema for the `Person` demo.

Queries are executed through:

- `db.exe(schema, queryName, params)` ([src/BSS/DBComponent.js](../../src/BSS/DBComponent.js))

In other projects you can add new schemas (e.g. `inventory`, `billing`) and put feature-specific SQL there.
