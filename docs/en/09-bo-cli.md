# 09 — BO CLI + tx + permissions (no manual DB work)

This repo includes a CLI that lets you:

- Create the standard BO structure (folder + baseline files).
- Register `object_na`, `method_na`, and `tx_nu` in Postgres (transaction mapping).
- Grant/revoke permissions to profiles (`security.permission_method`).

The CLI lives in [scripts/bo.ts](../../scripts/bo.ts) and runs via `npm run bo`.

## Requirements

- Postgres DB reachable with the `security` schema created.
- Environment/config DB is ready (see [docs/en/03-configuration.md](03-configuration.md)).
- Important: `Security` caches tx/permissions on startup. After DB changes, **restart the server**.

## What it manages

The CLI operates on these tables (see [docs/en/04-database-security-model.md](04-database-security-model.md)):

- `security.object(object_id, object_na)`
- `security.method(method_id, object_id, method_na, tx_nu)`
- `security.profile(profile_id)`
- `security.permission_method(profile_id, method_id)`

## Commands

All commands use:

- `npm run bo -- <command> [args] [options]`

### 1) Create a BO: `new`

Creates the standard BO structure with per-BO messages.

Example (default CRUD methods):

- `npm run bo -- new ObjectName`

Creates:

- `BO/ObjectName/ObjectNameBO.ts`
- `BO/ObjectName/ObjectName.ts` (entity + `ObjectNameRepository`)
- `BO/ObjectName/ObjectNameValidate.ts`
- `BO/ObjectName/messages/objectNameSuccessMsgs.json`
- `BO/ObjectName/ObjectNameErrorHandler.ts`
- `BO/ObjectName/messages/objectNameErrorMsgs.json`
- `BO/ObjectName/messages/objectNameAlerts.json`

Example (custom methods):

- `npm run bo -- new ObjectName --methods getObject,createObject,updateObject,deleteObject`

Useful options:

- `--force`: overwrite if files already exist.
- `--dry`: print what would happen without writing files.

#### Create + map in DB in one run (`--db`)

- `npm run bo -- new Order --db`

- `npm run bo -- new ObjectName --db`

The CLI:

1. Ensures/creates `security.object` (`object_na = "Order"`).
2. Inserts/updates `security.method` rows for each method.
3. Assigns `tx_nu` automatically from `max(tx_nu)+1`.

Tx control:

- `--txStart 200` to start at a chosen number.
- `--tx 201,202,203,204` to set explicit tx per method (must match method count).

### 2) Sync BO methods to DB: `sync`

Reads `BO/<Object>/<Object>BO.ts`, extracts methods and upserts them into `security.method`.

- `npm run bo -- sync ObjectName`

Options:

- `--txStart <n>` or `--tx <...>` to control `tx_nu`.
- `--dry` to preview without touching DB.

Notes:

- Method extraction is intentionally strict: only methods declared as `async <name>(...)` are considered business methods.
- During `sync`, methods starting with `_` are ignored (recommended for internal helpers like `_mapRow`, `_normalize`).
- Avoid defining extra public `async` helpers inside the BO unless you want them mapped to `tx` and permissions.

### 3) List DB mapping: `list`

Shows all registered combinations:

- `npm run bo -- list`

Typical output:

- `ObjectName.getObject tx=201`

### 4) Permissions: `perms`

Notes:

- `--dry` is DB-safe: it does **not** connect to Postgres.
- In `--dry` mode, the CLI does **not** validate that `Object.method` exists in DB; it only validates the `Object.method` format and prints the plan.

#### Quick mode (non-interactive)

Grant permissions:

- `npm run bo -- perms --profile 1 --allow ObjectName.getObject,ObjectName.createObject`

Revoke permissions:

- `npm run bo -- perms --profile 1 --deny ObjectName.deleteObject`

#### Interactive mode

- `npm run bo -- perms`

It lists `profile_id`, `object_na`, available methods, and lets you select.

## Recommended workflow (real project)

1. Create the BO structure:
    - `npm run bo -- new Order --methods getOrder,createOrder,updateOrder,deleteOrder`
2. Implement real DB queries in the repository (replace `TODO_*` placeholders).
3. Map methods to DB (tx):
    - `npm run bo -- sync Order --txStart 200`
4. Assign profile permissions:
    - `npm run bo -- perms --profile 2 --allow Order.getOrder,Order.createOrder`
5. Restart the server to reload `Security` cache.

## Important considerations

- **tx stability**: once used by a frontend, avoid changing `tx_nu` (it becomes part of your contract).
- **uniqueness**: ideally `security.method.tx_nu` should be unique (recommended DB constraint).
- **restart required**: in this version, tx/permissions are loaded only at startup.

## Troubleshooting

- “Missing security queries …”: check [src/config/queries.json](../../src/config/queries.json) under `security`.
- If the CLI can’t connect to DB: verify `.env`/`DATABASE_URL` and `config.db`.
- If the server doesn’t recognize a new tx: restart the server (`Security` cache).
