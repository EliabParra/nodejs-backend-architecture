# Documentation (EN)

These docs describe the current architecture in this repository and the rules to build new features following the same pattern.

## Quick map

- **Server entrypoint**: [src/index.js](../../src/index.js)
- **Globals (service locator)**: [src/globals.js](../../src/globals.js)
- **Dispatcher (Express + endpoints)**: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)
- **Security (tx + permissions + dynamic BO)**: [src/BSS/Security.js](../../src/BSS/Security.js)
- **Session (express-session)**: [src/BSS/Session.js](../../src/BSS/Session.js)
- **DB**: [src/BSS/DBComponent.js](../../src/BSS/DBComponent.js)
- **Validation (alerts)**: [src/BSS/Validator.js](../../src/BSS/Validator.js)
- **Pages router**: [src/router/pages.js](../../src/router/pages.js)
- **Example client**: [public/js/Sender.js](../../public/js/Sender.js)

## Index

1. [Run the project](01-getting-started.md)
2. [Architecture and execution flow](02-architecture.md)
3. [Config, messages and queries](03-configuration.md)
4. [Security model (schema `security`)](04-database-security-model.md)
5. [API contract (client-server)](05-api-contract.md)
6. [How to create a BO (dynamic dispatch)](06-dynamic-dispatch-and-bo.md)
7. [Validation and error handling](07-validation-and-errors.md)
8. [Pages and session](08-pages-and-session.md)

## Glossary

- **BSS** (*Basic Subsystem*): cross-cutting services under `src/BSS/` (DB, security, session, logging, validation, dispatcher).
- **BO** (*Business Object*): business modules under `BO/` (per entity/feature), dynamically loaded by `Security`.
- **tx**: transaction number sent by the client (`body.tx`) to decide what to execute.
- **object_na**: logical BO name (e.g. `Person`), used for file lookup and permissions.
- **method_na**: method name to invoke (e.g. `getPerson`, `createPerson`).
- **alerts**: list of validation messages produced by `Validator` (`v.getAlerts()`).
