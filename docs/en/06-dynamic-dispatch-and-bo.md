# 06 — Dynamic dispatch and how to create a BO

This architecture runs business logic without REST routes per resource: it executes BO methods through a **transaction dispatcher**.

## How a BO is resolved and executed

Implementation: [src/BSS/Security.js](../../src/BSS/Security.js)

- The server receives `{ tx, params }`.
- `tx` is translated to `{ object_na, method_na }` using `Security.txMap`.
- `Security.executeMethod()` builds the module path and loads the BO dynamically:

```js
const modulePath = `${config.bo.path}${object_na}/${object_na}BO.js`
const c = await import(modulePath)
const instance = new c[`${object_na}BO`]()
return await instance[method_na](params)
```

It also caches instances by `"object_na_method_na"` in `Security.instances`.

## Mandatory naming rules

For dynamic import to work:

1. Folder must exist: `BO/<object_na>/`
2. File must exist: `BO/<object_na>/<object_na>BO.js`
3. The file must export: `export class <object_na>BO { ... }`
4. The class must implement: `<method_na>(params)`
5. In DB, `security.object.object_na` and `security.method.method_na` must match those strings.

## Recommended BO structure

Typical structure (placeholders):

- BO (orchestration + messages): `BO/<ObjectName>/<ObjectName>BO.js`
- Repository / model (DB): `BO/<ObjectName>/<ObjectName>.js`
- Validation: `BO/<ObjectName>/<ObjectName>Validate.js`
- Success messages: `BO/<ObjectName>/<objectName>SuccessMsgs.json`
- Domain errors:
  - Handler: `BO/<ObjectName>/errors/<ObjectName>ErrorHandler.js`
  - Messages: `BO/<ObjectName>/errors/<objectName>ErrorMsgs.json`
  - Labels: `BO/<ObjectName>/errors/<objectName>Alerts.json`

If you want a full working example, see: [examples/bo-demo/BO](../../examples/bo-demo/BO)

## BO method contract

A BO method receives `params` (whatever is sent in the request) and returns an object with at least:

- `code` (number)
- `msg` (string)
- optionally `data` and/or `alerts`

Example:

- `<ObjectName>BO.<method>(params)` runs the operation and returns `{ data, msg, code }`.

## Checklist to add a new feature

1. Create `BO/<object_na>/` and `BO/<object_na>/<object_na>BO.js`.
2. Implement `export class <object_na>BO` with methods `method_na`.
3. (Optional but recommended) create `BO/<object_na>/<object_na>.js` and `<object_na>Validate.js`.
4. Add SQL queries under the target schema in [src/config/queries.json](../../src/config/queries.json).
5. Register `object_na` and `method_na` + `tx_nu` in the `security` schema. see [docs/en/04-database-security-model.md](04-database-security-model.md).
6. Grant permissions to profiles.
7. Call it from the client by sending `{ tx, params }`.

## Recommended approach (CLI)

To avoid manual DB work and keep the file structure consistent, use the CLI:

- Guide: [docs/en/09-bo-cli-and-permissions.md](09-bo-cli-and-permissions.md)

Quick examples:

- Create BO: `npm run bo -- new Order --methods getOrder,createOrder,updateOrder,deleteOrder`
- Map to DB (tx): `npm run bo -- sync Order --txStart 200`
- Grant permissions: `npm run bo -- perms --profile 2 --allow Order.getOrder,Order.createOrder`

## Note about `config.bo.path`

`config.bo.path` (in [src/config/config.json](../../src/config/config.json)) is a relative path used by `import()` from [src/BSS/Security.js](../../src/BSS/Security.js). If you move folders, keep this value consistent.
