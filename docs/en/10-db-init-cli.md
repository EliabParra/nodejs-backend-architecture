# 10 — DB init (`security` schema) + session table

In this architecture, the backend **depends** on the `security` schema (tx + permissions). This repo includes a small interactive CLI to create the minimum schema (idempotent) and optionally seed an admin user.

## TL;DR

1. Configure your Postgres connection via `.env` (`DATABASE_URL` or `PG*`).
2. Run:
    - `npm run db:init`

## What it creates

The script [scripts/db-init.ts](../../scripts/db-init.ts) creates (if missing):

- `security` schema
- Minimum tables required by [src/config/queries.json](../../src/config/queries.json):
    - `security.profile`
    - `security."user"`
    - `security.user_profile`
    - `security.object`
    - `security.method`
    - `security.permission_method`

It also creates the session table used by `connect-pg-simple`:

- Default: `public.session`
- Configurable: `security.session` (or any other schema/table)

It also adds common “operational” objects/columns (idempotent):

- `security."user"`: `is_active`, `created_at`, `updated_at`, `last_login_at`
- `security.profile`: `profile_na`
- `security.audit_log`: audit table + indexes

## Optional seed

In interactive (TTY) mode, by default it offers to create/update:

- `profile_id=1`
- `admin` user (bcrypt password) and a link in `security.user_profile`

This makes `POST /login` work without manual hash inserts.

## Auto-register BOs (tx + permissions) (new)

The script can also **auto-register** existing BOs under `BO/`:

- Finds folders `BO/<ObjectName>/` containing `BO/<ObjectName>/<ObjectName>BO.js`.
- Extracts methods declared as `async <method_na>(...)` (ignores methods starting with `_`).
- Upserts:
    - `security.object(object_na)`
    - `security.method(object_id, method_na, tx_nu)`
    - `security.permission_method(profile_id, method_id)`

By default (in TTY mode) it runs and grants permissions to `profile_id` (default `1`).

`tx_nu` rule:

- If the method already exists, it **keeps** the current `tx_nu`.
- For new methods, it assigns `tx_nu` starting at `max(tx_nu)+1` (or `--txStart`).

## Options

- `--print`: print SQL only (no DB changes).
- `--apply`: apply changes to the DB (default in TTY).
- `--yes`: non-interactive mode.

Session table (connect-pg-simple):

- `--sessionSchema <name>` (default `public`)
- `--sessionTable <name>` (default `session`)

Admin user:

- `--seedAdmin` (force seed)
- `--adminUser <name>` (default `admin`)
- `--adminPassword <pw>` (required if not in TTY)
- `--profileId <id>` (default `1`)

Profiles (optional, used by Auth flows):

- `--seedProfiles`: if no profiles exist, seed minimal profiles (public + session) (default in TTY)
- `--publicProfileId <id>` (default `2`): profile id used for anonymous `/toProccess` (public)
- `--sessionProfileId <id>` (default `1`): profile id used for authenticated sessions

Auth public permissions (optional):

- `--seedPublicAuthPerms`: when registering BOs, also grant the public profile permissions for Auth public methods
    - This is what enables anonymous `/toProccess` registration / email verification / password reset under `AUTH_PUBLIC_PROFILE_ID`.

Optional fields:

- `--includeEmail`: adds `security.user.user_em` (nullable + unique)

BO auto-registration:

- `--registerBo`: force auto-registration (default in TTY).
- `--txStart <n>`: starting tx for new methods.

Auth module (optional):

- `--auth`: create Auth support tables (password reset + one-time codes)
- `--authUsername`: keep username as a supported identifier (default: true)
    - When false, `security.user.user_na` becomes optional (nullable).
- `--authLoginId <value>`: `email|username` (default: `email`)
- `--authLogin2StepNewDevice`: enable 2-step login only for new devices

Environment equivalents (for db-init):

- `AUTH_ENABLE=1` (same as `--auth`)
- `AUTH_USERNAME=1|0` (same as `--authUsername`)
- `AUTH_LOGIN_ID=email|username`
- `AUTH_LOGIN_2STEP_NEW_DEVICE=1|0`
- `AUTH_SEED_PROFILES=1|0`
- `AUTH_PUBLIC_PROFILE_ID=<id>`
- `AUTH_SESSION_PROFILE_ID=<id>`
- `AUTH_SEED_PUBLIC_AUTH_PERMS=1|0`

## Configuring where the session table lives

At runtime, you can move/configure the session schema/table without editing `config.json`:

- `SESSION_SCHEMA=security`
- `SESSION_TABLE=session`

Implementation: [src/BSS/Session.ts](../../src/BSS/Session.ts) (passes `schemaName`/`tableName` to `connect-pg-simple`).

## Operational notes

- `Security` caches permissions and the tx-map at startup; after DB changes, restart the server.
- For tx/perms workflows, see [docs/en/04-database-security-model.md](04-database-security-model.md) and [docs/en/09-bo-cli.md](09-bo-cli.md).

## Audit (runtime)

When `security.audit_log` exists, the backend performs best-effort inserts (it will not break requests if it fails):

- `login`: inserts `action=login` and updates `last_login_at`.
- `logout`: inserts `action=logout`.
- `/toProccess`:
    - `tx_exec` (BO executed)
    - `tx_denied` (permissionDenied)
    - `tx_error` (unexpected error)

Typical fields: `request_id`, `user_id`, `profile_id`, `tx_nu`, `object_na`, `method_na`, `meta`.
