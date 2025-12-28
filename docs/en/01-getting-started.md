# 01 — Run the project

## Requirements

- Node.js (ESM project: `"type": "module"`) see [package.json](../../package.json)
- PostgreSQL (connection config in [src/config/config.json](../../src/config/config.json))

## Install

1. `npm install`
2. Set up the DB and the `security` schema (see [docs/en/04-database-security-model.md](04-database-security-model.md)).
3. Update connection settings in [src/config/config.json](../../src/config/config.json) if needed.

## Users and passwords (bcrypt)

Login no longer compares plaintext passwords. In `security.user.user_pw` you must store a **bcrypt hash**.

- Generate a hash:
	- `npm run hash:pw -- "MyStrongPassword123"`
	- (optional) rounds: `npm run hash:pw -- "MyStrongPassword123" 10`

Then store that hash as `user_pw` in the `security.user` table.

## Run

- Normal: `npm start` (runs [src/index.js](../../src/index.js))
- Dev: `npm run dev` (nodemon)

When running, the server exposes:

- `GET /` serves [public/pages/index.html](../../public/pages/index.html)
- `GET /content` (session-protected)
- `POST /login`
- `POST /logout`
- `POST /toProccess` (transaction dispatcher)

These endpoints are defined in [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js); pages routing is in [src/router/pages.js](../../src/router/pages.js).

## Quick manual smoke-test

1. Open `http://localhost:3000/`
2. Login (button “Ingresar”).
3. Try the Person CRUD demo (Get/Create/Update/Delete).

The example frontend uses `fetch` against `/login`, `/logout`, and `/toProccess` (see [public/js/Sender.js](../../public/js/Sender.js) and [public/js/scripts.js](../../public/js/scripts.js)).
