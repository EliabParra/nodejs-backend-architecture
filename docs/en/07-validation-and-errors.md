# 07 — Validation and error handling

## Validator (alerts)

Implementation: [src/BSS/Validator.ts](../../src/BSS/Validator.ts)

The validator exposes:

- `v.validateAll(params, types) -> boolean`
- `v.getAlerts() -> string[]`

### How to pass parameters

You can pass plain values or objects with metadata:

- Plain: `"hello"`
- With label: `{ value: 10, label: "The id" }`
- With length: `{ value: "abc", min: 3, max: 30, label: "The name" }`

On failure, `Validator` builds `alerts` using templates from [src/config/messages.json](../../src/config/messages.json) (`msgs[lang].alerts`).

### Example structure (generic)

- Labels per language: `BO/<ObjectName>/errors/<objectName>Alerts.json`
- Usage: `BO/<ObjectName>/<ObjectName>Validate.ts`

## HTTP schema validation (Dispatcher/Session)

In addition to the BO-level `Validator`, the server validates the **shape** of some HTTP requests (for example `/login`, `/logout`, `/toProccess`) before running business logic.

Implementation:

- [src/BSS/helpers/http-validators.ts](../../src/BSS/helpers/http-validators.ts)

This produces labeled `alerts` (`body`, `username`, `password`, etc.) using the same `Validator` message templates.

## Domain-level errors (pattern)

Example: `<ObjectName>`.

- Domain messages in JSON: `BO/<ObjectName>/errors/<objectName>ErrorMsgs.json`
- Normalizer/handler: `BO/<ObjectName>/errors/<ObjectName>ErrorHandler.ts`

Convention:

- A handler provides helpers like `XNotFound()`, `XInvalidParameters(alerts)`, `XUnauthorized()`, `UnknownError()`.
- Validation errors include `alerts: []`.

This allows BO methods to return standardized errors, and the dispatcher uses them directly.

## Infrastructure errors

### DB

[src/BSS/DBComponent.ts](../../src/BSS/DBComponent.ts) executes queries from `queries[schema][queryName]`.

- On exception, it logs and **throws** an `Error` (it does not return `null`).
- Domain/BO code should expect `await db.exe(...)` can throw and must handle it with `try/catch`.

Recommended pattern:

```ts
try {
    const r = await db.exe('schema', 'queryName', [
        /* params */
    ])
    // use r.rows
} catch (err) {
    // infrastructure error (DB), respond with a standard error
    return personErrors.UnknownError() // or msgs[lang].errors.client.unknown
}
```

### Dispatcher

[src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts)

- In `/toProccess`, unexpected exceptions return `msgs[lang].errors.client.unknown`.
- Details are written to log (`log.show(TYPE_ERROR, ...)`).

The final handler that normalizes unhandled errors lives in:

- [src/express/middleware/final-error-handler.ts](../../src/express/middleware/final-error-handler.ts)

## Internal consistency guideline

Within this architecture, a BO method should **always** return an object with `code` and `msg` (and optionally `data/alerts`) to keep the frontend contract stable.
