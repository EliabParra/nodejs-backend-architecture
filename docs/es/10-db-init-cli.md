# 10 — DB init (schema `security`) + tabla de sesión

En esta arquitectura, el backend **depende** del schema `security` (tx + permisos). Este repo incluye un mini-CLI para crear el esquema mínimo (idempotente) y opcionalmente sembrar un usuario admin.

## TL;DR

1. Configura tu conexión a Postgres por `.env` (`DATABASE_URL` o `PG*`).
2. Ejecuta:
    - `npm run db:init`

## Qué crea

El script [scripts/db-init.mjs](../../scripts/db-init.mjs) crea, si no existen:

- Schema `security`
- Tablas mínimas requeridas por [src/config/queries.json](../../src/config/queries.json):
    - `security.profile`
    - `security."user"`
    - `security.user_profile`
    - `security.object`
    - `security.method`
    - `security.permission_method`

También crea la tabla de sesión para `connect-pg-simple`:

- Por defecto: `public.session`
- Configurable: `security.session` (o cualquier otro schema/table)

Además, agrega columnas/objetos “operacionales” comunes (idempotente):

- `security."user"`: `is_active`, `created_at`, `updated_at`, `last_login_at`
- `security.profile`: `profile_na`
- `security.audit_log`: tabla de auditoría + índices

## Seed opcional

En modo interactivo (TTY), por default te ofrece crear/actualizar:

- `profile_id=1`
- usuario `admin` (password bcrypt) y su vínculo en `security.user_profile`

Esto hace que `POST /login` pueda funcionar sin que tengas que insertar manualmente hashes.

## Auto-registrar BOs (tx + permisos) (nuevo)

Además, el script puede **auto-registrar** BOs ya existentes en `BO/`:

- Detecta carpetas `BO/<ObjectName>/` que tengan `BO/<ObjectName>/<ObjectName>BO.js`.
- Extrae métodos declarados como `async <method_na>(...)` (ignora los que empiezan con `_`).
- Inserta/actualiza:
    - `security.object(object_na)`
    - `security.method(object_id, method_na, tx_nu)`
    - `security.permission_method(profile_id, method_id)`

Por default (en modo TTY) se ejecuta y concede permisos a `profile_id` (por default `1`).

Regla de `tx_nu`:

- Si el método ya existe en DB, **no cambia** su `tx_nu`.
- Para métodos nuevos, asigna `tx_nu` empezando en `max(tx_nu)+1` (o `--txStart`).

## Opciones

- `--print`: imprime el SQL (no aplica cambios).
- `--apply`: aplica cambios a la DB (default en TTY).
- `--yes`: modo no interactivo.

Sesión (tabla `connect-pg-simple`):

- `--sessionSchema <name>` (default `public`)
- `--sessionTable <name>` (default `session`)

Usuario admin:

- `--seedAdmin` (forzar seed)
- `--adminUser <name>` (default `admin`)
- `--adminPassword <pw>` (si no estás en TTY)
- `--profileId <id>` (default `1`)

Campos opcionales:

- `--includeEmail`: agrega `security.user.user_em` (nullable + unique)

Auto-registro BOs:

- `--registerBo`: fuerza auto-registro (por defecto en TTY).
- `--txStart <n>`: define el tx inicial para métodos nuevos.

## Configurar dónde vive la tabla de sesión

En runtime, puedes mover/configurar el schema/table de sesiones sin tocar `config.json`:

- `SESSION_SCHEMA=security`
- `SESSION_TABLE=session`

Implementación: [src/BSS/Session.js](../../src/BSS/Session.js) (usa `connect-pg-simple` con `schemaName`/`tableName`).

## Notas operativas

- `Security` cachea permisos y tx-map al inicio; después de cambios en DB, reinicia el server.
- Si cambias `security.method`/permisos y no se reflejan, revisa [docs/es/04-database-security-model.md](04-database-security-model.md) y [docs/es/09-bo-cli.md](09-bo-cli.md).

## Auditoría (runtime)

Cuando existe `security.audit_log`, el backend hace inserts best-effort (no rompe requests si falla):

- `login`: inserta `action=login` y actualiza `last_login_at`.
- `logout`: inserta `action=logout`.
- `/toProccess`:
    - `tx_exec` (cuando ejecuta el BO)
    - `tx_denied` (permissionDenied)
    - `tx_error` (error inesperado)

Campos típicos: `request_id`, `user_id`, `profile_id`, `tx_nu`, `object_na`, `method_na`, `meta`.
