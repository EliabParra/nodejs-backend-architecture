<div align="center">

# Node.js Backend Architecture (Starter/Blueprint)

Production-oriented **backend starter/blueprint** for Node.js (ESM) + Express 5 + Postgres.

[![Node.js (ESM)](https://img.shields.io/badge/Node.js-ESM-3c873a?style=for-the-badge)](#)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-336791?style=for-the-badge)](#)
[![Tests](https://img.shields.io/badge/Tests-node%20--test-2f6feb?style=for-the-badge)](#)
[![CI](https://img.shields.io/github/actions/workflow/status/EliabParra/nodejs-backend-architecture/ci.yml?branch=main&style=for-the-badge)](https://github.com/EliabParra/nodejs-backend-architecture/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6feb?style=for-the-badge)](LICENSE)

</div>

**Español:** ver [README.es.md](README.es.md)

## English

This repository is a **starter/blueprint** that gives you a solid backend baseline (security model + DX tooling) without forcing you into a full framework.

### Highlights

- Cookie sessions with Postgres store + CSRF protection (designed for web apps).
- Transaction/RPC-style execution via `POST /toProccess` (`tx` → permissions → BO method).
- DB-backed permission model (`security` schema) with CLIs for init + BO sync + permissions.
- Operational basics included: `/health`, `/ready`, request IDs, consistent JSON errors.
- Optional frontend hosting modes (`none`/`pages`/`spa`) with safe ordering.

### Who this is for

- Internal apps (B2B/admin) that want cookie sessions + CSRF.
- Teams that want a maintainable baseline and clear extension points.

### Who this is NOT for (yet)

- Public REST APIs that must be OpenAPI-first.
- Projects that require TypeScript-first + DI from day one.

### Quickstart (10 minutes)

1. Install:

```bash
npm install
```

2. Configure environment:

Copy `.env.example` to `.env` and set your Postgres connection (`DATABASE_URL` or `PG*`).

3. Initialize DB (required):

```bash
npm run db:init
```

Docs (EN):

- DB init CLI: [docs/en/10-db-init-cli.md](docs/en/10-db-init-cli.md)

4. Run:

```bash
npm run dev
# or
npm start
```

Useful endpoints:

- `GET /health`
- `GET /ready`
- `GET /csrf`
- `POST /login`
- `POST /logout`
- `POST /toProccess`

### Core idea (BO + tx)

- Your business logic lives in BO modules under `BO/<ObjectName>/<ObjectName>BO.js`.
- `security.method` maps `tx` → `(object_na, method_na)`.
- `security.permission_method` controls which profiles can execute which methods.

Scaffold a BO:

```bash
npm run bo -- new Order
```

Sync BO methods to DB (tx mapping):

```bash
npm run bo -- sync Order --txStart 100
```

### Documentation (EN)

Start here:

- English index: [docs/en/00-index.md](docs/en/00-index.md)
- Auth (EN): [docs/en/13-authentication.md](docs/en/13-authentication.md)
- Frontend tutorial (EN): [docs/en/11-frontend-clients-and-requests.md](docs/en/11-frontend-clients-and-requests.md)

### Scripts

| Script                                             | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- |
| `npm start`                                        | Runs the API server                                |
| `npm test`                                         | DB-safe tests (Node test runner)                   |
| `npm run dev`                                      | Runs with `nodemon`                                |
| `npm run format`                                   | Formats the repo (Prettier)                        |
| `npm run format:check`                             | Checks formatting (CI-friendly)                    |
| `npm run test:watch`                               | Runs tests in watch mode                           |
| `npm run test:coverage`                            | Generates coverage (c8)                            |
| `npm run verify`                                   | Verifies DB-safe (Node test runner)                |
| `npm run db:init`                                  | Initializes the `security` schema (idempotent)     |
| `npm run bo -- <command>`                          | BO CLI (scaffold BOs, sync tx, manage permissions) |
| `npm run hashpw -- "<plainPassword>" [saltRounds]` | Generates bcrypt hashes                            |

Coverage note: `c8` is configured to focus on runtime logic (`src/**/*.js`) and excludes wiring/entrypoints (e.g. `src/index.ts`) and JSDoc-only definitions (`src/jsdoc/**`).

### BO/ (your domain)

The `BO/` folder is intentionally **empty by design**.

- Add your BOs under `BO/<ObjectName>/<ObjectName>BO.js`.
- Scaffold quickly: `npm run bo -- new ObjectName`.

### License

MIT. See [LICENSE](LICENSE).

## Repo layout

- `src/`: backend runtime (Express + BSS services)
- `BO/`: your domain BOs (kept empty by default)
- `scripts/`: CLI tools (BO CLI, db-init, export starterpack, etc.)
- `docs/`: ES/EN documentation
- `public/`: optional static assets for `pages` mode (may be empty)
