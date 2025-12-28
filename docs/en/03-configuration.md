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
- Postgres: `DATABASE_URL` or `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSL`
- Session (rotation): `SESSION_SECRET` or `SESSION_SECRETS` (comma-separated)
  - Example: `SESSION_SECRETS=current_secret,previous_secret`
- Cookies (optional): `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_MAXAGE_MS`

## config.json

File: [src/config/config.json](../../src/config/config.json)

- `app.port`, `app.host`: Express bind address
- `app.lang`: active language (`"es"` or `"en"`)
- `db`: `pg.Pool` settings (used by [src/BSS/DBComponent.js](../../src/BSS/DBComponent.js))
- `session`: `express-session` settings (used by [src/BSS/Session.js](../../src/BSS/Session.js))
- `bo.path`: relative path used by `Security` to dynamically import BO modules (see [src/BSS/Security.js](../../src/BSS/Security.js))
- `log.activation`: flags per log level (error/info/debug/warn) used by [src/BSS/Log.js](../../src/BSS/Log.js)

### CORS (frontend frameworks on another port)

Config: [src/config/config.json](../../src/config/config.json) → `cors`

- `cors.enabled`: enables the CORS middleware.
- `cors.credentials`: allows cookies/session cross-origin (needed if the frontend runs on a different origin).
- `cors.origins`: allowlist of dev origins (e.g. Vite `http://localhost:5173`, Angular `http://localhost:4200`).

Implementation: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

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
