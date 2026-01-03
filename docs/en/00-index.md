# Documentation (EN)

These docs describe a **backend template (Node.js + Express)** for real projects: an API-first base with `tx` + permissions, plus **optional** examples kept isolated.

## What this is

A reference backend that demonstrates the architecture pattern (transaction dispatcher + BOs) and provides a practical starter (config, DB init, health/ready, DB-safe tests).

## Goals

- Be reusable as a clean starting point (not coupled to a specific demo domain).
- Standardize the full flow: request → security → BO → validation → response.
- Integrate with any frontend (separate SPA, `pages`, or `spa` serving a build).

## Audience

- Developers: extend the backend (create BOs, map `tx`, assign permissions).
- Teams: a starting point for a real backend.

## Principles

- **API-only by default** (`APP_FRONTEND_MODE=none`).
- **Demos isolated** under `examples/` and `public/` (see the Examples chapter).
- Consistent JSON contract + normalized errors.

## Quick map

- **Server entrypoint**: [src/index.ts](../../src/index.ts)
- **Globals (service locator)**: [src/globals.ts](../../src/globals.ts)
- **Dispatcher (Express + endpoints)**: [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts)
- **Express plumbing (middlewares/handlers/session wiring)**: `src/express/`
    - Middlewares: [src/express/middleware/](../../src/express/middleware/)
    - Handlers: [src/express/handlers/](../../src/express/handlers/)
    - Session wiring: [src/express/session/apply-session-middleware.ts](../../src/express/session/apply-session-middleware.ts)
- **Security (tx + permissions + dynamic BO)**: [src/BSS/Security.ts](../../src/BSS/Security.ts)
- **Session (express-session)**: [src/BSS/Session.ts](../../src/BSS/Session.ts)
- **DB**: [src/BSS/DBComponent.ts](../../src/BSS/DBComponent.ts)
- **Validation (alerts)**: [src/BSS/Validator.ts](../../src/BSS/Validator.ts)
- **Shared helpers (BSS)**: [src/BSS/helpers/](../../src/BSS/helpers/)
- **Pages router**: [src/router/pages.ts](../../src/router/pages.ts)
- **Included examples (client/pages/demo BO)**: see [docs/en/12-examples.md](12-examples.md)

## Index

1. [Run the project](01-getting-started.md)
2. [Architecture and execution flow](02-architecture.md)
3. [Config, messages and queries](03-configuration.md)
4. [Security model (schema `security`)](04-database-security-model.md)
5. [API contract (client-server)](05-api-contract.md)
6. [How to create a BO (dynamic dispatch)](06-dynamic-dispatch-and-bo.md)
7. [Validation and error handling](07-validation-and-errors.md)
8. [Pages and session](08-pages-and-session.md)
9. [BO CLI + tx + permissions](09-bo-cli.md)
10. [DB init CLI (`security` schema)](10-db-init-cli.md)
11. [Frontend clients and requests](11-frontend-clients-and-requests.md)
12. [Included examples (optional)](12-examples.md)
13. [Authentication (Auth module)](13-authentication.md)

## Glossary

- **BSS** (_Basic Subsystem_): cross-cutting services under `src/BSS/` (DB, security, session, logging, validation, dispatcher).
- **BO** (_Business Object_): business modules under `BO/` (per entity/feature), dynamically loaded by `Security`.
- **tx**: transaction number sent by the client (`body.tx`) to decide what to execute.
- **object_na**: logical BO name (e.g. `<ObjectName>`), used for file lookup and permissions.
- **method_na**: method name to invoke (e.g. `<methodName>`).
- **alerts**: list of validation messages produced by `Validator` (`v.getAlerts()`).
