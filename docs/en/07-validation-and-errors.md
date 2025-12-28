# 07 — Validation and error handling

## Validator (alerts)

Implementation: [src/BSS/Validator.js](../../src/BSS/Validator.js)

The validator exposes:

- `v.validateAll(params, types) -> boolean`
- `v.getAlerts() -> string[]`

### How to pass parameters

You can pass plain values or objects with metadata:

- Plain: `"hello"`
- With label: `{ value: 10, label: "The id" }`
- With length: `{ value: "abc", min: 3, max: 30, label: "The name" }`

On failure, `Validator` builds `alerts` using templates from [src/config/messages.json](../../src/config/messages.json) (`msgs[lang].alerts`).

### Real example (Person)

- Labels per language: [BO/Person/errors/personAlerts.json](../../BO/Person/errors/personAlerts.json)
- Usage: [BO/Person/PersonValidate.js](../../BO/Person/PersonValidate.js)

## Domain-level errors (pattern)

Example: `Person`.

- Domain messages in JSON: [BO/Person/errors/personErrorMsgs.json](../../BO/Person/errors/personErrorMsgs.json)
- Normalizer/handler: [BO/Person/errors/PersonErrorHandler.js](../../BO/Person/errors/PersonErrorHandler.js)

Convention:

- A handler provides helpers like `XNotFound()`, `XInvalidParameters(alerts)`, `XUnauthorized()`, `UnknownError()`.
- Validation errors include `alerts: []`.

This allows BO methods to return standardized errors, and the dispatcher uses them directly.

## Infrastructure errors

### DB

[src/BSS/DBComponent.js](../../src/BSS/DBComponent.js) executes queries from `queries[schema][queryName]`.

- On exception, it logs and **throws** an `Error` (it does not return `null`).
- Domain/BO code should expect `await db.exe(...)` can throw and must handle it with `try/catch`.

Recommended pattern:

```js
try {
	const r = await db.exe('schema', 'queryName', [/* params */])
	// use r.rows
} catch (err) {
	// infrastructure error (DB), respond with a standard error
	return personErrors.UnknownError() // or msgs[lang].errors.client.unknown
}
```

### Dispatcher

[src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

- In `/toProccess`, unexpected exceptions return `msgs[lang].errors.client.unknown`.
- Details are written to log (`log.show(TYPE_ERROR, ...)`).

## Internal consistency guideline

Within this architecture, a BO method should **always** return an object with `code` and `msg` (and optionally `data/alerts`) to keep the frontend contract stable.
