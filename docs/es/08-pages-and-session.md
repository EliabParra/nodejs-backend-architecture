# 08 — Páginas y sesión

## Páginas estáticas

Las páginas (modo `pages`) viven en `public/pages/`.

Los archivos HTML concretos incluidos en este repo son **ejemplos** (no parte del core). Ver:

- [docs/es/11-examples.md](11-examples.md)

Express sirve `public/` como estático **solo si** `APP_FRONTEND_MODE=pages` (modo legacy) desde [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js).

El registro del hosting de frontend se hace vía adapter (para mantener el backend desacoplado):

- Entry: [src/frontend-adapters/index.js](../../src/frontend-adapters/index.js)
- Pages adapter: [src/frontend-adapters/pages.adapter.js](../../src/frontend-adapters/pages.adapter.js)

`pagesPath` está definido en [src/router/routes.js](../../src/router/routes.js).

## Router de páginas

Definición de rutas (declarativa): [src/router/routes.js](../../src/router/routes.js)

Ejemplo actual:

- `/` (home) `validateIsAuth: false`
- `/content` `validateIsAuth: true`

Router y middleware: [src/router/pages.js](../../src/router/pages.js)

- Si una ruta tiene `validateIsAuth: true`, se aplica `requireAuth`.
- Si no hay sesión, redirige a `/?returnTo=<ruta>`.

> Nota: el código hace `res.redirect(...).status(...).send(...)`; en práctica, `redirect` ya inicia la respuesta. La intención del diseño es: redirigir y, además, dejar un status/mensaje.

## Nota sobre desacople

En proyectos reales, lo recomendado es `APP_FRONTEND_MODE=none` (API-only) y que el frontend (React/Angular/Vue/etc.) se deploye separado.

El modo `pages` existe solo como ejemplo/legacy para servir HTML desde este mismo backend.

## Sesión (express-session)

Implementación: [src/BSS/Session.js](../../src/BSS/Session.js)

- La clase `Session` orquesta login/logout y reglas de sesión.
- El wiring de Express (express-session + store + schema/table) se aplica desde:
  - [src/express/session/apply-session-middleware.js](../../src/express/session/apply-session-middleware.js)
- Criterio de sesión activa: `req.session && req.session.user_id`.

Recomendación:

- `saveUninitialized: false` para no persistir sesiones vacías (reduce ruido en DB y mejora performance).

### Store (Postgres)

Para producción / escalabilidad, la sesión se puede persistir en Postgres (en vez de MemoryStore).

Config: [src/config/config.json](../../src/config/config.json) → `session.store`

```json
"store": {
  "type": "pg",
  "tableName": "session",
  "ttlSeconds": 1800,
  "pruneIntervalSeconds": 300
}
```

- `ttlSeconds`: TTL de la sesión en DB (en segundos). Si no se define, se deriva desde `cookie.maxAge`.
- `pruneIntervalSeconds`: cada cuánto el store limpia sesiones expiradas.

Requiere crear la tabla (una vez) ejecutando: [postgres.session.sql](../../postgres.session.sql)

### Cookies (seguridad)

Config: [src/config/config.json](../../src/config/config.json) → `session.cookie`

- `httpOnly: true`: el JS del navegador no puede leer la cookie.
- `sameSite: "lax"`: reduce CSRF en escenarios típicos.
- `secure: true` (recomendado en producción con HTTPS): la cookie solo viaja por HTTPS.
- `maxAge`: TTL en ms.

Notas:

- Si usas frontend en otro origen y necesitas cookies cross-site reales, normalmente se requiere `sameSite: "none"` + `secure: true` + HTTPS.
- Si `secure: true` y hay reverse proxy (Nginx/Render/Heroku), se necesita `trust proxy` (ya soportado por el BSS `Session`).

### Crear sesión

`Session.createSession(req, res)`:

- Valida `username` y `password` (mínimo 8)
- Consulta DB con `db.exe('security', 'getUser', [username])`
- Compara el password con `bcrypt.compare(password, user.user_pw)` (hash)
- Si existe, setea:
  - `req.session.user_id`
  - `req.session.user_na`
  - `req.session.profile_id`

### Destruir sesión

`Session.destroySession(req)` ejecuta `req.session.destroy()`.

## Cómo se usa desde el frontend

El flujo recomendado para consumir el backend (cookies + CSRF + `/toProccess`) está explicado en:

- [docs/es/10-frontend-clients-and-requests.md](10-frontend-clients-and-requests.md)
