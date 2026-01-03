# 04 — Security model (schema `security`)

This architecture uses a **transaction-driven** model: the client sends a `tx`, the server resolves it to `(object_na, method_na)` from the `security` schema, checks permissions, and only then executes the BO.

## Queries that define the model

All security SQL is under the `security` key in [src/config/queries.json](../../src/config/queries.json).

- `security.getUser`: fetches the user by `user_na` and returns `user_pw` (hash) so the server can verify passwords with bcrypt
- `security.loadPermissions`: loads allowed `(object_na, method_na)` per profile
- `security.loadDataTx`: loads `tx` → `(object_na, method_na)` mapping (returned as `tx_nu` alias)

These are loaded at process startup by [src/BSS/Security.ts](../../src/BSS/Security.ts).

## Expected tables (inferred from current queries)

The current queries imply these minimum tables/fields:

- `security.users`: `user_id` (PK), `username`, `password` (**bcrypt hash**)
- `security.profiles`: `profile_id` (PK)
- `security.user_profiles`: `user_id` (FK), `profile_id` (FK)
- `security.objects`: `object_id` (PK), `object_name`
- `security.methods`: `method_id` (PK), `object_id` (FK), `method_name`, `tx`
- `security.permission_methods`: `profile_id` (FK), `method_id` (FK)

## Optional (recommended) fields and tables

For real-world usage (not just demos), it’s common to add:

- `security.users`:
    - `is_active` (disable users without deleting)
    - `created_at`, `updated_at`
    - `last_login_at`
    - optional `email`
- `security.profiles.profile_name` (human-friendly profile name)
- `security.audit_logs` (audit events for login/logout/tx)

The `npm run db:init` CLI creates these extensions in an idempotent way.

## Runtime behavior

1. On startup, `Security.loadDataTx()` builds `txMap: Map<tx, {object_na, method_na}>`.
2. On startup, `Security.loadPermissions()` builds `permission: Map<"profile_id_method_na_object_na", true>`.
3. For each `/toProccess` request:
    - `txMap.get(tx)` resolves the target
    - `permission.get("<profile>_<method>_<object>")` authorizes it

## How to register a new transaction (tx)

Minimum steps to make a new feature executable:

1. **Create/register the object**
    - Insert into `security.objects` with `object_name = "<YourObject>"`

2. **Create/register the method**
    - Insert into `security.methods` with:
        - the `object_id`
        - `method_name = "<yourMethod>"`
        - `tx = <txNumber>`

3. **Grant permissions**
    - Insert into `security.permission_methods` for each authorized profile (`profile_id`, `method_id`).

4. **Assign profiles to users** (if needed)
    - Ensure `security.user_profiles` links the user to the profile.

## Critical consistency rules

- `object_na` must match exactly:
    - folder `BO/<object_na>/`
        - source file `BO/<object_na>/<object_na>BO.ts`
          (build output is `...BO.js` under `dist/`)
    - exported class name `export class <object_na>BO { ... }`
      (see [docs/en/06-dynamic-dispatch-and-bo.md](06-dynamic-dispatch-and-bo.md))

- `method_na` must exist as a method on the BO class.

## Operational note

Permissions and tx mappings are loaded **once at startup** (in-memory cache). If you change `security.methods` or permissions in the DB, you need to restart the server in the current version.

## Login (detail)

Implementation: [src/BSS/Session.ts](../../src/BSS/Session.ts)

- The `security.getUser` query no longer checks the password in SQL.
- The server compares `password` vs `user.user_pw` using bcrypt.

Benefit: passwords are never stored in plaintext; this reduces impact if the DB leaks.
