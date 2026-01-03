# 10 — DB init (schema `security`) + tabla de sesión

En esta arquitectura, el backend **depende** del schema `security` (tx + permisos). Este repo incluye un mini-CLI para crear el esquema mínimo (idempotente) y opcionalmente sembrar un usuario admin.

## TL;DR

1. Configura tu conexión a Postgres por `.env` (`DATABASE_URL` o `PG*`).
2. Ejecuta:
    - `npm run db:init`

## Qué crea

El script [scripts/db-init.ts](../../scripts/db-init.ts) crea, si no existen:

- Schema `security`
- Tablas mínimas requeridas por [src/config/queries.json](../../src/config/queries.json):
    - `security.profiles`
    - `security.users`
    - `security.user_profiles`
    - `security.objects`
    - `security.methods`
    - `security.permission_methods`

También crea la tabla de sesión para `connect-pg-simple`:

- Por defecto: `security.sessions`
- Configurable: cualquier schema/table vía `--sessionSchema` / `--sessionTable` (o env `SESSION_SCHEMA` / `SESSION_TABLE`)

Además, agrega columnas/objetos “operacionales” comunes (idempotente):

- `security.users`: `is_active`, `created_at`, `updated_at`, `last_login_at`
- `security.profiles`: `profile_name`
- `security.audit_logs`: tabla de auditoría + índices

### Correr sobre una DB existente (renames legacy)

Si antes usabas los nombres legacy (`security."user"`, `security.method`, `security.permission_method`, etc.), `db:init` incluye renames best-effort **idempotentes**.

Solo renombra cuando:

- existe el nombre viejo, y
- el nombre nuevo convencional **no** existe todavía.

Esto evita terminar con tablas duplicadas como `security.method` y `security.methods` al mismo tiempo.

## Seed opcional

En modo interactivo (TTY), por default te ofrece crear/actualizar:

- `profile_id=1`
- usuario `admin` (password bcrypt) y su vínculo en `security.user_profile`

Nota: con el esquema actual, la tabla puente es `security.user_profiles`.

Esto hace que `POST /login` pueda funcionar sin que tengas que insertar manualmente hashes.

## Auto-registrar BOs (tx + permisos) (nuevo)

Además, el script puede **auto-registrar** BOs ya existentes en `BO/`:

- Detecta carpetas `BO/<ObjectName>/` que tengan `BO/<ObjectName>/<ObjectName>BO.ts`.
    - En build/producción, el output compilado es `...BO.js` bajo `dist/`.
- Extrae métodos declarados como `async <method_na>(...)` (ignora los que empiezan con `_`).
- Inserta/actualiza:
    - `security.objects(object_name)`
    - `security.methods(object_id, method_name, tx)`
    - `security.permission_methods(profile_id, method_id)`

Por default (en modo TTY) se ejecuta y concede permisos a `profile_id` (por default `1`).

Regla de `tx`:

- Si el método ya existe en DB, **no cambia** su `tx`.
- Para métodos nuevos, asigna `tx` empezando en `max(tx)+1` (o `--txStart`).

Nota: en runtime, las queries siguen exponiendo aliases compatibles (`tx_nu`, `method_na`, `object_na`).

## Opciones

- `--print`: imprime el SQL (no aplica cambios).
- `--apply`: aplica cambios a la DB (default en TTY).
- `--yes`: modo no interactivo.

Sesión (tabla `connect-pg-simple`):

- `--sessionSchema <name>` (default `security`)
- `--sessionTable <name>` (default `sessions`)

Usuario admin:

- `--seedAdmin` (forzar seed)
- `--adminUser <name>` (default `admin`)
- `--adminPassword <pw>` (si no estás en TTY)
- `--profileId <id>` (default `1`)

Perfiles (opcional, usado por flujos Auth):

- `--seedProfiles`: si no existen perfiles, crea perfiles mínimos (public + session) (default en TTY)
- `--publicProfileId <id>` (default `2`): id de perfil usado para `/toProccess` anónimo (public)
- `--sessionProfileId <id>` (default `1`): id de perfil usado para sesiones autenticadas

Permisos públicos de Auth (opcional):

- `--seedPublicAuthPerms`: al registrar BOs, también concede al perfil público permisos para métodos públicos de Auth
    - Esto es lo que habilita el `/toProccess` anónimo para registro / verificación de email / reset de password bajo `AUTH_PUBLIC_PROFILE_ID`.

Campos opcionales:

- `--includeEmail`: agrega `security.users.email` (nullable + unique)

Auto-registro BOs:

- `--registerBo`: fuerza auto-registro (por defecto en TTY).
- `--txStart <n>`: define el tx inicial para métodos nuevos.

Módulo Auth (opcional):

- `--auth`: crea tablas de soporte de Auth (password reset + one-time codes)
- `--authUsername`: mantiene `username` como identificador soportado (default: true)
    - Si es false, `security.users.username` pasa a ser opcional (nullable).
- `--authLoginId <value>`: `email|username` (default: `email`)
- `--authLogin2StepNewDevice`: habilita login 2-step solo para dispositivos nuevos

Equivalentes por environment (para db-init):

- `AUTH_ENABLE=1` (igual a `--auth`)
- `AUTH_USERNAME=1|0` (igual a `--authUsername`)
- `AUTH_LOGIN_ID=email|username`
- `AUTH_LOGIN_2STEP_NEW_DEVICE=1|0`
- `AUTH_SEED_PROFILES=1|0`
- `AUTH_PUBLIC_PROFILE_ID=<id>`
- `AUTH_SESSION_PROFILE_ID=<id>`
- `AUTH_SEED_PUBLIC_AUTH_PERMS=1|0`

Generación del preset Auth BO (opcional):

- `--authBo`: genera archivos preset bajo `./BO/Auth` (AuthBO + repo + validate + messages)
- `--authBoForce`: sobrescribe si ya existen
- `--authBoSkip`: nunca generar/preguntar por el preset

Equivalentes por env:

- `AUTH_BO=1`
- `AUTH_BO_FORCE=1|0`
- `AUTH_BO_SKIP=1|0`

## Configurar dónde vive la tabla de sesión

En runtime, puedes mover/configurar el schema/table de sesiones sin tocar `config.json`:

- `SESSION_SCHEMA=security`
- `SESSION_TABLE=sessions`

Implementación: [src/BSS/Session.ts](../../src/BSS/Session.ts) (usa `connect-pg-simple` con `schemaName`/`tableName`).

## Notas operativas

- `Security` cachea permisos y tx-map al inicio; después de cambios en DB, reinicia el server.
- Si cambias `security.methods`/permisos y no se reflejan, revisa [docs/es/04-database-security-model.md](04-database-security-model.md) y [docs/es/09-bo-cli.md](09-bo-cli.md).

## Auditoría (runtime)

Cuando existe `security.audit_logs`, el backend hace inserts best-effort (no rompe requests si falla):

- `login`: inserta `action=login` y actualiza `last_login_at`.
- `logout`: inserta `action=logout`.
- `/toProccess`:
    - `tx_exec` (cuando ejecuta el BO)
    - `tx_denied` (permissionDenied)
    - `tx_error` (error inesperado)

Campos típicos: `request_id`, `user_id`, `profile_id`, `tx`, `object_name`, `method_name`, `meta`.
