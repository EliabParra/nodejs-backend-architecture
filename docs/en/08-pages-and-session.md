# 08 — Pages and session

## Static pages

Pages live under `public/pages/`.

The concrete HTML files included in this repo are **examples** (not part of the core template). See:

- [12-examples.md](12-examples.md)

Express serves `public/` statically **only when** `APP_FRONTEND_MODE=pages` (legacy mode) from [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js).

Frontend hosting registration is handled via an adapter (to keep the backend decoupled):

- Entry: [src/frontend-adapters/index.js](../../src/frontend-adapters/index.js)
- Pages adapter: [src/frontend-adapters/pages.adapter.js](../../src/frontend-adapters/pages.adapter.js)

`pagesPath` is defined in [src/router/routes.js](../../src/router/routes.js).

## Pages router

Declarative routes: [src/router/routes.js](../../src/router/routes.js)

Current example:

- `/` (home) `validateIsAuth: false`
- `/content` `validateIsAuth: true`

Router + middleware: [src/router/pages.js](../../src/router/pages.js)

- Routes with `validateIsAuth: true` use `requireAuth`.
- If no session exists, it redirects to `/?returnTo=<path>`.

> Note: the code does `res.redirect(...).status(...).send(...)`; in practice `redirect` already begins the response. The design intent is: redirect and also provide a status/message.

## Note on decoupling

For real projects, the recommended setup is `APP_FRONTEND_MODE=none` (API-only) and deploying your frontend (React/Angular/Vue/etc.) separately.

The `pages` mode exists mainly as a legacy/demo that serves HTML from this backend.

## Session (express-session)

Implementation: [src/BSS/Session.js](../../src/BSS/Session.js)

- The `Session` class orchestrates login/logout and session rules.
- Express wiring (express-session + store + schema/table) is applied via:
  - [src/express/session/apply-session-middleware.js](../../src/express/session/apply-session-middleware.js)
- Session active rule: `req.session && req.session.user_id`.

Recommendation:

- Set `saveUninitialized: false` to avoid persisting empty sessions (less DB noise, better performance).

### Store (Postgres)

For production/scaling, sessions can be persisted in Postgres (instead of the in-memory store).

Config: [src/config/config.json](../../src/config/config.json) → `session.store`

```json
"store": {
  "type": "pg",
  "tableName": "session",
  "ttlSeconds": 1800,
  "pruneIntervalSeconds": 300
}
```

- `ttlSeconds`: DB TTL for sessions (seconds). If not provided, it is derived from `cookie.maxAge`.
- `pruneIntervalSeconds`: how often the store prunes expired sessions.

Note: the session table is created by `npm run db:init` (recommended). If you already manage schema migrations elsewhere, ensure the session table exists in the configured schema/table.

### Cookies (security)

Config: [src/config/config.json](../../src/config/config.json) → `session.cookie`

- `httpOnly: true`: browser JS cannot read the cookie.
- `sameSite: "lax"`: reduces CSRF in typical scenarios.
- `secure: true` (recommended in production with HTTPS): cookie is only sent over HTTPS.
- `maxAge`: TTL in ms.

Notes:

- If you run the frontend on a different site and need true cross-site cookies, browsers typically require `sameSite: "none"` + `secure: true` + HTTPS.
- If `secure: true` behind a reverse proxy (Nginx/Render/Heroku), you must enable `trust proxy` (supported by the `Session` BSS).

### Create session

`Session.createSession(req, res)`:

- Validates `username` and `password` (min length 8)
- Queries DB: `db.exe('security', 'getUser', [username])`
- Compares password with `bcrypt.compare(password, user.user_pw)` (hash)
- On success, sets:
  - `req.session.user_id`
  - `req.session.user_na`
  - `req.session.profile_id`

### Destroy session

`Session.destroySession(req)` calls `req.session.destroy()`.

## How the frontend uses it

The recommended client flow (cookies + CSRF + `/toProccess`) is described in:

- [11-frontend-clients-and-requests.md](11-frontend-clients-and-requests.md)

If you want to inspect the included demo pages/scripts/client, see:

- [12-examples.md](12-examples.md)
