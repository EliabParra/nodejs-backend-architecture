# 01 — Cómo correr el proyecto

## Requisitos

- Node.js (proyecto ESM: `"type": "module"`) ver [package.json](../../package.json)
- PostgreSQL (credenciales por `.env` / environment variables; ver [docs/es/03-configuration.md](03-configuration.md))

## Instalación

1. `npm install`
2. Configura la DB y el esquema `security` (ver [docs/es/04-database-security-model.md](04-database-security-model.md)).
3. Copia [\.env.example](../../.env.example) a `.env` y configura `PG*` o `DATABASE_URL`.

> Nota: [src/config/config.json](../../src/config/config.json) deja valores `CHANGE_ME` para no commitear secretos.

## Usuarios y passwords (bcrypt)

El login ya **no compara contraseña en texto plano**. En `security.user.user_pw` debes guardar un **hash bcrypt**.

- Generar hash:
	- `npm run hashpw -- "MiPasswordSegura123"`
	- (opcional) rounds: `npm run hashpw -- "MiPasswordSegura123" 10`

Luego guarda ese hash como `user_pw` en tu tabla `security.user`.

## Ejecutar

- Modo normal: `npm start` (corre [src/index.js](../../src/index.js))
- Modo dev: `npm run dev` (nodemon)

## Deployment (producción)

En producción normalmente corres el backend con:

- `npm start`

Y configuras secrets/DB por environment variables (ver [03-configuration.md](03-configuration.md)).

### Checks (salud y readiness)

- `GET /health`: liveness (proceso vivo) → esperado `200`
- `GET /ready`: readiness (dependencias OK) → `200` si DB + security están listas; si no, `503`

Ver detalle en [05-api-contract.md](05-api-contract.md).

### Escenario A — Frontend separado (recomendado, API-only)

1. En el backend: `APP_FRONTEND_MODE=none`.
2. Publica el frontend en su propio hosting (Vercel/Netlify/S3+CloudFront/etc.).
3. Configura CORS para tu dominio del frontend (ver `config.cors.*` en [03-configuration.md](03-configuration.md)).
4. Si usas sesión por cookie cross-origin, revisa `SESSION_COOKIE_SECURE` / `SESSION_COOKIE_SAMESITE`.

### Escenario B — Backend sirviendo el build SPA

1. Compila tu frontend (en el repo del frontend): `npm run build`.
2. En el backend:
	- `APP_FRONTEND_MODE=spa`
	- `SPA_DIST_PATH=<carpeta que contiene index.html>`
3. Inicia el backend con `npm start`.

El backend servirá assets estáticos del build y hará fallback a `index.html` para rutas del SPA.

### (Opcional) levantar backend + frontend a la vez

Si en tu equipo quieres un comando para levantar ambos (sin acoplar el backend a un framework), usa:

- `npm run full`

> Nota: `npm run full` es solo un helper de desarrollo, no un patrón de producción.

Requiere configurar en el `.env` del backend:

- `FRONTEND_PATH=...` (ruta al repo del frontend con `package.json`)
- (opcional) `FRONTEND_SCRIPT=start`
- (opcional) `BACKEND_SCRIPT=dev`

Para conectar cualquier frontend, ver [10-frontend-clients-and-requests.md](10-frontend-clients-and-requests.md).

Al levantar, el servidor expone siempre:

- `POST /login`
- `POST /logout`
- `POST /toProccess` (dispatcher transaccional)

Rutas de páginas (`/` y `/content`) dependen del modo:

- `APP_FRONTEND_MODE=none` (default): **no** sirve páginas (API-only).
- `APP_FRONTEND_MODE=pages`: sirve [public/pages/index.html](../../public/pages/index.html) y la página protegida.
- `APP_FRONTEND_MODE=spa`: sirve un build SPA desde `SPA_DIST_PATH` y hace fallback a `index.html`.

Estos endpoints se definen en [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js). El router de páginas (modo `pages`) está en [src/router/pages.js](../../src/router/pages.js).

## Primer smoke-test (manual)

1. Abrir `http://localhost:3000/` (solo si `APP_FRONTEND_MODE=pages` o `spa`)
2. Iniciar sesión (botón “Ingresar”).
3. Probar CRUD persona (botones Obtener/Crear/Actualizar/Eliminar).

El frontend de ejemplo usa `fetch` hacia `/login`, `/logout` y `/toProccess` (ver [public/js/Sender.js](../../public/js/Sender.js) y [public/js/scripts.js](../../public/js/scripts.js)).
