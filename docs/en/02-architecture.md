# 02 — Architecture and execution flow

## Layered structure

- **Client (static)**: `public/` (HTML/CSS/JS)
- **Pages router**: `src/router/` (serves HTML and protects routes)
- **Dispatcher (API)**: `src/BSS/Dispatcher.ts` (`/login`, `/logout`, `/toProccess`)
- **HTTP/Express layer (plumbing)**: `src/express/` (middlewares, handlers, session wiring)
- **BSS (cross-cutting services)**: `src/BSS/` (DB, session, security, validator, log)
- **BO (business)**: `BO/` (e.g. `BO/ObjectName/`).
    - Full demo BOs live under `examples/bo-demo/BO/`.
- **Config**: `src/config/` (runtime config, messages, SQL queries)

## Bootstrap

1. [src/index.ts](../../src/index.ts)

- Imports [src/globals.ts](../../src/globals.ts)

- Creates `new Dispatcher()`, runs `await dispatcher.init()`, then calls `serverOn()`

2. [src/globals.ts](../../src/globals.ts)
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

- `POST /toProccess` in [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts)

### Sequence (high level)

1. **Session check**: `Session.sessionExists(req)` ([src/BSS/Session.ts](../../src/BSS/Session.ts))
2. **Wait for security initialization (race-free)**

- `Security` preloads `txMap` and permissions from the DB.
- `/toProccess` awaits `security.ready` before using `txMap`, avoiding requests hitting an empty cache during startup.

2. **Resolve tx → (object_na, method_na)**: `security.getDataTx(body.tx)` ([src/BSS/Security.ts](../../src/BSS/Security.ts))
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

- [src/frontend-adapters/index.ts](../../src/frontend-adapters/index.ts)

## Express plumbing (where it lives now)

- Middlewares (helmet, CORS, parsers, CSRF, rate limit, requestId/log): `src/express/middleware/`
- Health/readiness handlers: `src/express/handlers/`
- Session wiring (express-session + store): [src/express/session/apply-session-middleware.ts](../../src/express/session/apply-session-middleware.ts)

`Dispatcher` is intentionally kept as the orchestrator: it registers routes, composes middlewares, and delegates Express configuration to small modules.

## Pages router

- Route declarations: [src/router/routes.ts](../../src/router/routes.ts)
- Router + `requireAuth` middleware: [src/router/pages.ts](../../src/router/pages.ts)
- Routes can be protected per route config (e.g. `validateIsAuth=true`).
- When auth is required and no session exists, the router redirects to `/?returnTo=...`.

## Contract between layers (practical rule)

- **BSS** should be reusable and domain-agnostic.
- **BO** orchestrates domain: validation, DB calls, and shaping the final response.
- **Domain model/entity** (optional) can encapsulate queries and low-level rules; the BO defines the business message.
