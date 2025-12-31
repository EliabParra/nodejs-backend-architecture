# 02 — Architecture and execution flow

## Layered structure

- **Client (static)**: `public/` (HTML/CSS/JS)
- **Pages router**: `src/router/` (serves HTML and protects routes)
- **Dispatcher (API)**: `src/BSS/Dispatcher.js` (`/login`, `/logout`, `/toProccess`)
- **HTTP/Express layer (plumbing)**: `src/express/` (middlewares, handlers, session wiring)
- **BSS (cross-cutting services)**: `src/BSS/` (DB, session, security, validator, log)
- **BO (business)**: `BO/` (example: `BO/Person/`)
- **Config**: `src/config/` (runtime config, messages, SQL queries)

## Bootstrap

1. [src/index.js](../../src/index.js)
   - Imports [src/globals.js](../../src/globals.js)
  - Creates `new Dispatcher()`, runs `await dispatcher.init()`, then calls `serverOn()`

2. [src/globals.js](../../src/globals.js)
   - Loads JSON via `require` (config, queries, messages)
   - Creates global singletons:
     - `globalThis.v` (Validator)
     - `globalThis.log` (Log)
     - `globalThis.db` (DBComponent)
     - `globalThis.security` (Security)

**Important**: the current architecture uses `globalThis` as a service locator. BO/BSS modules read `config`, `msgs`, `queries`, `db`, `v`, `log`, `security` from globals.

Note: for consistency with the repository style, some `src/express/` modules also read globals (e.g. `log`, `msgs`, `config`).

## Request flow (transactional API)

### Endpoint

- `POST /toProccess` in [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

### Sequence (high level)

1. **Session check**: `Session.sessionExists(req)` ([src/BSS/Session.js](../../src/BSS/Session.js))
2. **Wait for security initialization (race-free)**
  - `Security` preloads `txMap` and permissions from the DB.
  - `/toProccess` awaits `security.ready` before using `txMap`, avoiding requests hitting an empty cache during startup.
2. **Resolve tx → (object_na, method_na)**: `security.getDataTx(body.tx)` ([src/BSS/Security.js](../../src/BSS/Security.js))
3. **Permissions**: `security.getPermissions({ profile_id, method_na, object_na })`
4. **Execute BO**: `security.executeMethod({ object_na, method_na, params })`
5. **Response**: `res.status(response.code).send(response)`

### Diagram

```
Client
  | POST /toProccess { tx, params }
  v
Dispatcher.toProccess
  |-- Session.sessionExists?
  |-- Security.getDataTx(tx)
  |-- Security.getPermissions(profile_id, method_na, object_na)
  |-- Security.executeMethod -> BO.<method>(params)
  v
Response { code, msg, data?, alerts? }
```

Decoupling note: the backend can run in **API-only** mode (`APP_FRONTEND_MODE=none`). In that mode, page/SPA hosting is implemented via a **frontend adapter** loaded with a dynamic import only when the selected mode requires it, so the core does not import UI modules.

Adapter entrypoint:

- [src/frontend-adapters/index.js](../../src/frontend-adapters/index.js)

## Express plumbing (where it lives now)

- Middlewares (helmet, CORS, parsers, CSRF, rate limit, requestId/log): `src/express/middleware/`
- Health/readiness handlers: `src/express/handlers/`
- Session wiring (express-session + store): [src/express/session/apply-session-middleware.js](../../src/express/session/apply-session-middleware.js)

`Dispatcher` is intentionally kept as the orchestrator: it registers routes, composes middlewares, and delegates Express configuration to small modules.

## Pages router

- Route declarations: [src/router/routes.js](../../src/router/routes.js)
- Router + `requireAuth` middleware: [src/router/pages.js](../../src/router/pages.js)
- `/content` requires a session; otherwise it redirects to `/?returnTo=...`

## Contract between layers (practical rule)

- **BSS** should be reusable and domain-agnostic.
- **BO** orchestrates domain: validation, DB calls, and shaping the final response.
- **Domain model/entity** (example: `Person`) can encapsulate queries and low-level rules; the BO defines the business message.
