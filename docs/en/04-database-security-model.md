# 04 — Security model (schema `security`)

This architecture uses a **transaction-driven** model: the client sends a `tx`, the server translates it to `(object_na, method_na)` from the `security` schema, checks permissions, and only then executes the BO.

## Queries that define the model

All security SQL is under the `security` key in [src/config/queries.json](../../src/config/queries.json).

- `security.getUser`: fetches the user by `user_na` and returns `user_pw` (hash) so the server can verify passwords with bcrypt
- `security.loadPermissions`: loads allowed `(object_na, method_na)` per profile
- `security.loadDataTx`: loads `tx_nu` → `(object_na, method_na)` mapping

These are loaded at process startup by [src/BSS/Security.js](../../src/BSS/Security.js).

## Expected tables (inferred from current queries)

The current queries imply these minimum tables/fields:

- `security.user`: `user_id` (PK), `user_na`, `user_pw` (**bcrypt hash**)
- `security.profile`: `profile_id` (PK)
- `security.user_profile`: `user_id` (FK), `profile_id` (FK)
- `security.object`: `object_id` (PK), `object_na`
- `security.method`: `method_id` (PK), `object_id` (FK), `method_na`, `tx_nu`
- `security.permission_method`: `profile_id` (FK), `method_id` (FK)

## Runtime behavior

1. On startup, `Security.loadDataTx()` builds `txMap: Map<tx_nu, {object_na, method_na}>`.
2. On startup, `Security.loadPermissions()` builds `permission: Map<"profile_id_method_na_object_na", true>`.
3. For each `/toProccess` request:
   - `txMap.get(tx)` resolves the target
   - `permission.get("<profile>_<method>_<object>")` authorizes it

## How to register a new transaction (tx)

Minimum steps to make a new feature executable:

1. **Create/register the object**
   - Insert into `security.object` with `object_na = "<YourObject>"`

2. **Create/register the method**
   - Insert into `security.method` with:
     - the `object_id`
     - `method_na = "<yourMethod>"`
     - `tx_nu = <txNumber>`

3. **Grant permissions**
   - Insert into `security.permission_method` for each authorized profile (`profile_id`, `method_id`).

4. **Assign profiles to users** (if needed)
   - Ensure `security.user_profile` links the user to the profile.

## Critical consistency rules

- `object_na` must match exactly:
  - folder `BO/<object_na>/`
  - file `BO/<object_na>/<object_na>BO.js`
  - exported class name `export class <object_na>BO { ... }`
  (see [docs/en/06-dynamic-dispatch-and-bo.md](06-dynamic-dispatch-and-bo.md))

- `method_na` must exist as a method on the BO class.

## Operational note

Permissions and tx mappings are loaded **once at startup** (in-memory cache). If you change `security.method` or permissions in the DB, you need to restart the server in the current version.

## Login (detail)

Implementation: [src/BSS/Session.js](../../src/BSS/Session.js)

- The `security.getUser` query no longer checks the password in SQL.
- The server compares `password` vs `user.user_pw` using bcrypt.

Benefit: passwords are never stored in plaintext; this reduces impact if the DB leaks.
