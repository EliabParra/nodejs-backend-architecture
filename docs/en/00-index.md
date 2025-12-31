# Documentation (EN)

These docs describe the current architecture in this repository and the rules to build new features following the same pattern.

## Quick map

- **Server entrypoint**: [src/index.js](../../src/index.js)
- **Globals (service locator)**: [src/globals.js](../../src/globals.js)
- **Dispatcher (Express + endpoints)**: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)
- **Express plumbing (middlewares/handlers/session wiring)**: `src/express/`
	- Middlewares: [src/express/middleware/](../../src/express/middleware/)
	- Handlers: [src/express/handlers/](../../src/express/handlers/)
	- Session wiring: [src/express/session/apply-session-middleware.js](../../src/express/session/apply-session-middleware.js)
- **Security (tx + permissions + dynamic BO)**: [src/BSS/Security.js](../../src/BSS/Security.js)
- **Session (express-session)**: [src/BSS/Session.js](../../src/BSS/Session.js)
- **DB**: [src/BSS/DBComponent.js](../../src/BSS/DBComponent.js)
- **Validation (alerts)**: [src/BSS/Validator.js](../../src/BSS/Validator.js)
- **Shared helpers (BSS)**: [src/BSS/helpers/](../../src/BSS/helpers/)
- **Pages router**: [src/router/pages.js](../../src/router/pages.js)
- **Included examples (client/pages/demo BO)**: see [docs/en/11-examples.md](11-examples.md)

## Index

1. [Run the project](01-getting-started.md)
2. [Architecture and execution flow](02-architecture.md)
3. [Config, messages and queries](03-configuration.md)
4. [Security model (schema `security`)](04-database-security-model.md)
5. [API contract (client-server)](05-api-contract.md)
6. [How to create a BO (dynamic dispatch)](06-dynamic-dispatch-and-bo.md)
7. [Validation and error handling](07-validation-and-errors.md)
8. [Pages and session](08-pages-and-session.md)
9. [BO CLI + tx + permissions](09-bo-cli-and-permissions.md)
10. [Frontend tutorial (clients and requests)](10-frontend-clients-and-requests.md)
11. [Included examples (optional)](11-examples.md)
12. [DB init (`security` schema)](11-db-init.md)

## Glossary

- **BSS** (*Basic Subsystem*): cross-cutting services under `src/BSS/` (DB, security, session, logging, validation, dispatcher).
- **BO** (*Business Object*): business modules under `BO/` (per entity/feature), dynamically loaded by `Security`.
- **tx**: transaction number sent by the client (`body.tx`) to decide what to execute.
- **object_na**: logical BO name (e.g. `<ObjectName>`), used for file lookup and permissions.
- **method_na**: method name to invoke (e.g. `<methodName>`).
- **alerts**: list of validation messages produced by `Validator` (`v.getAlerts()`).
