# 08 — Páginas y sesión

## Páginas estáticas

Las páginas viven en `public/pages/`:

- Login + ejemplo CRUD: [public/pages/index.html](../../public/pages/index.html)
- Página protegida: [public/pages/content.html](../../public/pages/content.html)

Express sirve `public/` como estático desde [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js) usando `express.static(pagesPath)`.

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

## Sesión (express-session)

Implementación: [src/BSS/Session.js](../../src/BSS/Session.js)

- Se inicializa con `app.use(session(config.session))` usando [src/config/config.json](../../src/config/config.json).
- Criterio de sesión activa: `req.session && req.session.user_id`.

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
- Consulta DB con `db.exe('security', 'getUser', [username, password])`
- Si existe, setea:
  - `req.session.user_id`
  - `req.session.user_na`
  - `req.session.profile_id`

### Destruir sesión

`Session.destroySession(req)` ejecuta `req.session.destroy()`.

## Cómo se usa desde el frontend

- Login: [public/js/scripts.js](../../public/js/scripts.js) llama a `sender.send(..., '/login')`.
- Logout: llama a `sender.send(..., '/logout')`.

El `Sender` está en [public/js/Sender.js](../../public/js/Sender.js) y siempre usa `fetch` con `Content-Type: application/json`.
