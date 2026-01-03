# 03 — Configuración, mensajes y queries

## Dónde vive la configuración

Se carga al iniciar en [src/globals.ts](../../src/globals.ts) usando `createRequire()`:

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

- App: `APP_NAME`, `APP_PORT`, `APP_HOST`, `APP_LANG`
    - `APP_NAME`: nombre lógico del servicio (aparece en `/health`).
- Frontend hosting (opcional):
    - `APP_FRONTEND_MODE`: `pages` | `spa` | `none`
        - `pages`: el backend sirve HTML desde `public/pages` (modo legacy, como el curso original)
        - `spa`: el backend sirve un build SPA y hace fallback a `index.html` (el frontend maneja rutas)
        - `none`: el backend no sirve páginas (solo API) (**default**, para estar desacoplado)
    - `SPA_DIST_PATH` (solo modo `spa`): ruta al output del frontend (carpeta que contiene `index.html`)
- Postgres: `DATABASE_URL` o `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSL`
- Sesión (rotación): `SESSION_SECRET` o `SESSION_SECRETS` (separado por comas)
    - Ejemplo: `SESSION_SECRETS=secret_actual,secret_anterior`
- Session store (opcional): `SESSION_SCHEMA`, `SESSION_TABLE`
    - Útil si quieres que la tabla de sesión viva en otro schema (ej. `security`).
- Cookies (opcional): `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_MAXAGE_MS`

- Auth (opcional): `AUTH_LOGIN_ID`, `AUTH_LOGIN_2STEP_NEW_DEVICE`, `AUTH_PUBLIC_PROFILE_ID`, `AUTH_SESSION_PROFILE_ID`, `AUTH_REQUIRE_EMAIL_VERIFICATION`
    - `AUTH_LOGIN_ID`: `email` | `username` (el default viene de `config.auth.loginId`).
    - `AUTH_LOGIN_2STEP_NEW_DEVICE`: `1|0` (cuando `1`, `/login` puede devolver `202` y requerir `POST /login/verify`).
    - `AUTH_PUBLIC_PROFILE_ID`: habilita `/toProccess` anónimo ejecutando como ese perfil (igual aplica permisos).
    - `AUTH_SESSION_PROFILE_ID`: define el perfil asignado al registrar (default viene de `config.auth.sessionProfileId`).
    - `AUTH_REQUIRE_EMAIL_VERIFICATION`: `1|0` (cuando `1`, debes verificar email antes de poder hacer login).

- Email (opcional): `EMAIL_MODE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM`
    - `EMAIL_MODE`: `log` | `smtp`.
    - Las variables SMTP aplican cuando `EMAIL_MODE=smtp`.

Variables extra (producción / reverse proxy):

- `APP_TRUST_PROXY`: configura `app.set('trust proxy', ...)` en Express (útil detrás de un proxy/LB).
    - Valores comunes: `1` (un proxy), `true` (confiar en todos; úsalo con cuidado).
- CORS por env (opcional):
    - `CORS_ENABLED=true|false`
    - `CORS_CREDENTIALS=true|false`
    - `CORS_ORIGINS=https://mi-frontend.com,https://admin.mi-frontend.com`

Logging (opcional):

- `LOG_FORMAT=text|json`
    - `text` (default): formato humano (colores) como el curso.
    - `json`: una línea JSON por evento (recomendado para producción / agregadores de logs).

## config.json

Archivo: [src/config/config.json](../../src/config/config.json)

- `app.port`, `app.host`: dónde levanta Express
- `app.name`: nombre lógico del servicio (usado por `/health`).
- `app.lang`: idioma activo (`"es"` o `"en"`). Afecta `msgs[...]` y alerts.
- `app.frontendMode`: `"pages"` | `"spa"` | `"none"` (ver arriba)
- `app.bodyLimit` (opcional): límite de tamaño para requests JSON/urlencoded (ej. `"100kb"`, `"1mb"`).
- `db`: parámetros para `pg.Pool` (ver [src/BSS/DBComponent.ts](../../src/BSS/DBComponent.ts))
- `session`: configuración de `express-session` (ver [src/BSS/Session.ts](../../src/BSS/Session.ts))
- `bo.path`: ruta relativa usada por `Security` para importar BO dinámicamente (ver [src/BSS/Security.ts](../../src/BSS/Security.ts))
- `log.activation`: flags por nivel (error/info/debug/warn) usados por [src/BSS/Log.ts](../../src/BSS/Log.ts)
- `log.format` (opcional): `"text"` | `"json"` (puede venir de `LOG_FORMAT`)

Nota: con `info` activo, el servidor loguea también requests exitosos (2xx/3xx) con `requestId` y `durationMs` (ver [docs/es/05-api-contract.md](05-api-contract.md)).

### CORS (compatibilidad con frontends en otro puerto)

Config: [src/config/config.json](../../src/config/config.json) → `cors`

- `cors.enabled`: activa el middleware CORS en el servidor.
- `cors.credentials`: permite cookies/sesión cross-origin (necesario si el frontend corre en otro origen).
- `cors.origins`: allowlist de orígenes permitidos en dev (ej. Vite `http://localhost:5173`, Angular `http://localhost:4200`).

Cableado: [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts) compone el middleware.

La implementación vive en módulos dedicados de Express:

- CORS: [src/express/middleware/cors.ts](../../src/express/middleware/cors.ts)
- CSRF: [src/express/middleware/csrf.ts](../../src/express/middleware/csrf.ts)

Nota (CSRF): para requests `POST` debes enviar el header `X-CSRF-Token` (ver [docs/es/05-api-contract.md](05-api-contract.md)).

### Cookies + CORS en producción (guía rápida)

- Si el frontend y backend están en **dominios distintos** y usas sesión por cookie:
    - en el frontend: `credentials: 'include'` / `withCredentials: true`
    - en el backend: `cors.credentials=true` y `cors.origins` con allowlist del/los dominios reales
    - cookie:
        - `SESSION_COOKIE_SECURE=true` (HTTPS)
        - `SESSION_COOKIE_SAMESITE=none` (cross-site)
    - detrás de proxy/LB: define `APP_TRUST_PROXY=1` (o el valor apropiado) para que Express detecte HTTPS y soporte cookies `secure`.

- Si frontend y backend están en el **mismo dominio** (mismo “site”): normalmente `SESSION_COOKIE_SAMESITE=lax` es suficiente.

### Headers de seguridad (helmet)

El servidor aplica headers de seguridad estándar via `helmet` y deshabilita `X-Powered-By`.

Cableado: [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts) compone el middleware.

La implementación vive en:

- Helmet: [src/express/middleware/helmet.ts](../../src/express/middleware/helmet.ts)

## Modo de páginas (backend) vs SPA (frontend)

Puedes elegir quién “posee” las rutas:

- `none` (default / recomendado): API-only (no sirve páginas).
- `pages`: Express sirve páginas desde `public/pages` (rutas definidas en `src/router/routes.ts`).
- `spa`: Express sirve un build SPA (React/Angular/Vue/etc.) y responde `index.html` para rutas no-API.

Scripts principales en `package.json`:

- `npm start`: producción (usa `.env`/env vars)
- `npm run dev`: desarrollo (nodemon)

Para `spa`, el backend NO asume ninguna carpeta por defecto (para mantenerse desacoplado). Debes configurar `SPA_DIST_PATH` o `config.app.spaDistPath`. Si falta, el backend lo pide al iniciar (en modo interactivo).

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

Puedes crear otros schemas (por ejemplo `inventory`, `billing`, etc.) y agregar allí sus queries.

Extensiones opcionales de queries:

- `QUERIES_EXTRA_PATH` (opcional): hace merge de queries adicionales desde un JSON (ruta absoluta o relativa al repo).

El acceso se hace con:

- `db.exe(schema, queryName, params)` en [src/BSS/DBComponent.ts](../../src/BSS/DBComponent.ts)

Nota sobre params:

- `params` puede ser un Array (recomendado), un Object o un solo valor.
- Si pasas un Object, `db.exe` lo convierte a array iterando sus propiedades; **el orden de las propiedades debe coincidir con el orden `$1..$n`** de tu query SQL.

Opción más segura (named params):

- Si prefieres objects, usa `db.exeNamed(schema, queryName, paramsObj, orderKeys)` donde `orderKeys` es un array como `['person_id','person_na','person_ln']`.
- Esto fuerza un orden estable y puede fallar rápido si faltan/sobran llaves o si el conteo de placeholders del SQL no coincide.
