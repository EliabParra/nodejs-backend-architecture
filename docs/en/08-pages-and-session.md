# 08 — Pages and session

## Static pages

Pages live under `public/pages/`:

- Login + demo CRUD: [public/pages/index.html](../../public/pages/index.html)
- Protected page: [public/pages/content.html](../../public/pages/content.html)

Express serves `public/` statically from [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js) via `express.static(pagesPath)`.

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

## Session (express-session)

Implementation: [src/BSS/Session.js](../../src/BSS/Session.js)

- Initialized via `app.use(session(config.session))` using [src/config/config.json](../../src/config/config.json).
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

You must create the table once by running: [postgres.session.sql](../../postgres.session.sql)

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

- Login: [public/js/scripts.js](../../public/js/scripts.js) calls `sender.send(..., '/login')`.
- Logout: calls `sender.send(..., '/logout')`.

The fetch wrapper is [public/js/Sender.js](../../public/js/Sender.js) and it always uses JSON (`Content-Type: application/json`).
