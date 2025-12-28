# 01 — Cómo correr el proyecto

## Requisitos

- Node.js (proyecto ESM: `"type": "module"`) ver [package.json](../../package.json)
- PostgreSQL (config en [src/config/config.json](../../src/config/config.json))

## Instalación

1. `npm install`
2. Configura la DB y el esquema `security` (ver [docs/es/04-database-security-model.md](04-database-security-model.md)).
3. Ajusta conexión en [src/config/config.json](../../src/config/config.json) si es necesario.

## Ejecutar

- Modo normal: `npm start` (corre [src/index.js](../../src/index.js))
- Modo dev: `npm run dev` (nodemon)

Al levantar, el servidor expone:

- `GET /` sirve [public/pages/index.html](../../public/pages/index.html)
- `GET /content` (protegida por sesión)
- `POST /login`
- `POST /logout`
- `POST /toProccess` (dispatcher transaccional)

Estos endpoints se definen en [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js) y el router de páginas en [src/router/pages.js](../../src/router/pages.js).

## Primer smoke-test (manual)

1. Abrir `http://localhost:3000/`
2. Iniciar sesión (botón “Ingresar”).
3. Probar CRUD persona (botones Obtener/Crear/Actualizar/Eliminar).

El frontend de ejemplo usa `fetch` hacia `/login`, `/logout` y `/toProccess` (ver [public/js/Sender.js](../../public/js/Sender.js) y [public/js/scripts.js](../../public/js/scripts.js)).
