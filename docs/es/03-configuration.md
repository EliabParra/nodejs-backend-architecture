# 03 — Configuración, mensajes y queries

## Dónde vive la configuración

Se carga al iniciar en [src/globals.js](../../src/globals.js) usando `createRequire()`:

- `config` desde [src/config/config.json](../../src/config/config.json)
- `queries` desde [src/config/queries.json](../../src/config/queries.json)
- `msgs` desde [src/config/messages.json](../../src/config/messages.json)

Esto habilita el acceso global vía `globalThis.config`, `globalThis.queries`, `globalThis.msgs`.

## Overrides por environment variables (recomendado)

Para evitar hardcodear secretos (DB password, `session.secret`, etc.), el runtime soporta overrides desde `process.env`.

En el repo, [src/config/config.json](../../src/config/config.json) deja valores "placeholder" (`CHANGE_ME`) para que no se suban secretos reales.

- En local, puedes copiar [\.env.example](../../.env.example) a `.env`.
- En producción, defines estas variables en tu plataforma (Render/Docker/K8s/etc.).

Variables soportadas:

- App: `APP_PORT`, `APP_HOST`, `APP_LANG`
- Postgres: `DATABASE_URL` o `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSL`
- Sesión (rotación): `SESSION_SECRET` o `SESSION_SECRETS` (separado por comas)
  - Ejemplo: `SESSION_SECRETS=secret_actual,secret_anterior`
- Cookies (opcional): `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_MAXAGE_MS`

## config.json

Archivo: [src/config/config.json](../../src/config/config.json)

- `app.port`, `app.host`: dónde levanta Express
- `app.lang`: idioma activo (`"es"` o `"en"`). Afecta `msgs[...]` y alerts.
- `db`: parámetros para `pg.Pool` (ver [src/BSS/DBComponent.js](../../src/BSS/DBComponent.js))
- `session`: configuración de `express-session` (ver [src/BSS/Session.js](../../src/BSS/Session.js))
- `bo.path`: ruta relativa usada por `Security` para importar BO dinámicamente (ver [src/BSS/Security.js](../../src/BSS/Security.js))
- `log.activation`: flags por nivel (error/info/debug/warn) usados por [src/BSS/Log.js](../../src/BSS/Log.js)

### CORS (compatibilidad con frontends en otro puerto)

Config: [src/config/config.json](../../src/config/config.json) → `cors`

- `cors.enabled`: activa el middleware CORS en el servidor.
- `cors.credentials`: permite cookies/sesión cross-origin (necesario si el frontend corre en otro origen).
- `cors.origins`: allowlist de orígenes permitidos en dev (ej. Vite `http://localhost:5173`, Angular `http://localhost:4200`).

Implementación: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

## messages.json

Archivo: [src/config/messages.json](../../src/config/messages.json)

Estructura por idioma:

- `logs`: etiquetas
- `errors.server`: errores internos del servidor (500, txNotFound, dbError, ...)
- `errors.client`: errores "de uso" (401 login requerido, permissionDenied, invalidParameters, ...)
- `success`: mensajes de éxito (login/logout/create/update/delete)
- `alerts`: plantillas de validación para `Validator`

El código selecciona mensajes por idioma con `msgs[config.app.lang]`.

## queries.json

Archivo: [src/config/queries.json](../../src/config/queries.json)

Estructura:

```json
{
  "<schema>": {
    "<queryName>": "SQL ...",
    "...": "..."
  }
}
```

Ejemplos actuales:

- `security`: **schema definitivo** del modelo de auth/roles/tx/permisos.
- `enterprise`: schema de ejemplo para la entidad `Person`.

El acceso se hace con:

- `db.exe(schema, queryName, params)` en [src/BSS/DBComponent.js](../../src/BSS/DBComponent.js)

Para otros proyectos puedes crear otros schemas (por ejemplo `inventory`, `billing`, etc.) y agregar allí sus queries.
