# 01 — Run the project

## Requirements

- Node.js (ESM project: `"type": "module"`) see [package.json](../../package.json)
- PostgreSQL (credentials via `.env` / environment variables; see [docs/en/03-configuration.md](03-configuration.md))

## Install

1. `npm install`
2. Set up the DB and the `security` schema (see [docs/en/04-database-security-model.md](04-database-security-model.md)).
3. Copy [\.env.example](../../.env.example) to `.env` and set `PG*` or `DATABASE_URL`.

> Note: [src/config/config.json](../../src/config/config.json) keeps `CHANGE_ME` placeholders so real secrets are not committed.

## Users and passwords (bcrypt)

Login no longer compares plaintext passwords. In `security.user.user_pw` you must store a **bcrypt hash**.

- Generate a hash:
	- `npm run hashpw -- "MyStrongPassword123"`
	- (optional) rounds: `npm run hashpw -- "MyStrongPassword123" 10`

Then store that hash as `user_pw` in the `security.user` table.

## Run

- Normal: `npm start` (runs [src/index.js](../../src/index.js))
- Dev: `npm run dev` (nodemon)

### (Optional) start backend + frontend together

If your team wants a single command to start both (without coupling the backend to any specific framework), use:

- `npm run full`

In backend `.env` set:

- `FRONTEND_PATH=...` (path to the frontend repo containing `package.json`)
- (optional) `FRONTEND_SCRIPT=start`
- (optional) `BACKEND_SCRIPT=dev`

To connect any frontend, see [10-frontend-clients-and-requests.md](10-frontend-clients-and-requests.md).

When running, the server always exposes:

- `POST /login`
- `POST /logout`
- `POST /toProccess` (transaction dispatcher)

Page routes (`/` and `/content`) depend on the mode:

- `APP_FRONTEND_MODE=none` (default): serves **no** pages (API-only).
- `APP_FRONTEND_MODE=pages`: serves [public/pages/index.html](../../public/pages/index.html) and the protected page.
- `APP_FRONTEND_MODE=spa`: serves a SPA build from `SPA_DIST_PATH` and falls back to `index.html`.

These endpoints are defined in [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js). The pages router (pages mode) is in [src/router/pages.js](../../src/router/pages.js).

## Quick manual smoke-test

1. Open `http://localhost:3000/` (only if `APP_FRONTEND_MODE=pages` or `spa`)
2. Login (button “Ingresar”).
3. Try the Person CRUD demo (Get/Create/Update/Delete).

The example frontend uses `fetch` against `/login`, `/logout`, and `/toProccess` (see [public/js/Sender.js](../../public/js/Sender.js) and [public/js/scripts.js](../../public/js/scripts.js)).
