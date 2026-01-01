<div align="center">

# Node.js Backend Architecture (Template)

Backend template for Node.js (ESM) + Express 5, designed for real projects.

[![Node.js (ESM)](https://img.shields.io/badge/Node.js-ESM-3c873a?style=for-the-badge)](#)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-336791?style=for-the-badge)](#)
[![Tests](https://img.shields.io/badge/Tests-node%20--test-2f6feb?style=for-the-badge)](#)

</div>

## Español

### Qué es este repositorio

Este repo es un **template de backend** pensado para ser fácil de extender y seguro como base para proyectos reales.

- **Por defecto es API-only** (`APP_FRONTEND_MODE=none`).
- Los **demos/ejemplos son opcionales** y viven aislados en `examples/` y `public/`.

### Objetivo y audiencia

**Objetivos**
- Dar una base limpia: config, modelo de seguridad, sesión, endpoints de health/readiness.
- Estandarizar el flujo completo: request → seguridad (`tx` + permisos) → ejecución BO → validación → respuesta JSON normalizada.
- Soportar cualquier frontend: SPA separada, `pages` (legacy) o servir un build SPA.

**Audiencia**
- Desarrolladores que quieran una base estable y consistente.
- Equipos que necesiten un starter backend con límites claros y demos opcionales.
- Proyectos internos (B2B/admin) donde sesiones/cookies y CSRF sean el camino.

### Conceptos clave

- **BO (Business Object)** vive en `BO/<ObjectName>/`.
- Un endpoint transaccional **`POST /toProccess`** ejecuta operaciones identificadas por `tx`.
- El schema **`security`** guarda mapeo de `tx` + reglas de permisos.

### Quickstart

1) Instalar:

```bash
npm install
```

2) Configurar environment:

Copia `.env.example` a `.env` y configura Postgres (`DATABASE_URL` o `PG*`).

3) Inicializar DB (requerido):

```bash
npm run db:init
```

Docs (ES):
- DB init CLI: [docs/es/10-db-init-cli.md](docs/es/10-db-init-cli.md)

4) Ejecutar:

```bash
npm run dev
# o
npm start
```

Endpoints útiles:
- `GET /health`
- `GET /ready`
- `GET /csrf`
- `POST /login`
- `POST /logout`
- `POST /toProccess`

### Documentación (ES)

Empieza aquí:
- Índice ES: [docs/es/00-index.md](docs/es/00-index.md)
- Tutorial Frontend (ES): [docs/es/11-frontend-clients-and-requests.md](docs/es/11-frontend-clients-and-requests.md)
- Ejemplos (ES): [docs/es/12-examples.md](docs/es/12-examples.md)

### Scripts

| Script | Descripción |
|---|---|
| `npm start` | Levanta el API server |
| `npm run dev` | Levanta con `nodemon` |
| `npm test` | Tests DB-safe (`node --test`) |
| `npm run db:init` | Inicializa schema `security` (idempotente) |
| `npm run bo -- <command>` | CLI BO (scaffold, sync tx, permisos) |
| `npm run hashpw -- "<plainPassword>" [saltRounds]` | Genera hashes bcrypt |
| `npm run full` | Helper opcional (backend + frontend) vía `FRONTEND_PATH` |
| `npm run export:starter` | Export limpio (sin BOs demo) |

### BO/ (tu dominio)

La carpeta `BO/` se mantiene **vacía por diseño**.

- Agrega tus BOs en `BO/<ObjectName>/<ObjectName>BO.js`.
- Scaffold rápido: `npm run bo -- new ObjectName`.
- BOs demo (opcional): `examples/bo-demo/BO/`.

<br/><br/>
---

## English

### What this repository is

This repository is a **backend template** designed to be easy to extend and safe as a starting point for real projects.

- **Default is API-only** (`APP_FRONTEND_MODE=none`).
- **Demos/examples are optional** and kept isolated under `examples/` and `public/`.

### Goals and audience

**Goals**
- Provide a clean baseline: config, security model, session, health/readiness endpoints.
- Standardize the full flow: request → security (`tx` + permissions) → BO execution → validation → normalized JSON response.
- Support any frontend approach: separate SPA, legacy `pages`, or serving a built SPA.

**Audience**
- Developers who want a stable baseline.
- Teams that need a starter backend with clear boundaries and optional demos.
- Internal apps (B2B/admin) where cookie sessions + CSRF fit well.

### Key concepts

- **BO (Business Object)** modules live in `BO/<ObjectName>/`.
- A single transactional endpoint **`POST /toProccess`** executes operations identified by `tx`.
- The DB schema **`security`** stores `tx` mappings and permission rules.

### Quickstart

1) Install:

```bash
npm install
```

2) Configure environment:

Copy `.env.example` to `.env` and set your Postgres connection (`DATABASE_URL` or `PG*`).

3) Initialize DB (required):

```bash
npm run db:init
```

Docs (EN):
- DB init CLI: [docs/en/10-db-init-cli.md](docs/en/10-db-init-cli.md)

4) Run:

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

### Documentation (EN)

Start here:
- English index: [docs/en/00-index.md](docs/en/00-index.md)
- Frontend tutorial (EN): [docs/en/11-frontend-clients-and-requests.md](docs/en/11-frontend-clients-and-requests.md)
- Examples (EN): [docs/en/12-examples.md](docs/en/12-examples.md)

### Scripts

| Script | Description |
|---|---|
| `npm start` | Runs the API server |
| `npm run dev` | Runs with `nodemon` |
| `npm test` | DB-safe tests (`node --test`) |
| `npm run db:init` | Initializes the `security` schema (idempotent) |
| `npm run bo -- <command>` | BO CLI (scaffold BOs, sync tx, manage permissions) |
| `npm run hashpw -- "<plainPassword>" [saltRounds]` | Generates bcrypt hashes |
| `npm run full` | Optional dev helper (backend + frontend) via `FRONTEND_PATH` |
| `npm run export:starter` | Exports a clean starterpack (without demo BOs) |

### BO/ (your domain)

The `BO/` folder is intentionally **empty by design**.

- Add your BOs under `BO/<ObjectName>/<ObjectName>BO.js`.
- Scaffold quickly: `npm run bo -- new ObjectName`.
- Demo BOs (optional): `examples/bo-demo/BO/`.

## Repo layout

- `src/`: backend runtime (Express + BSS services)
- `BO/`: your domain BOs (kept empty by default)
- `scripts/`: CLI tools (BO CLI, db-init, export starterpack, etc.)
- `docs/`: ES/EN documentation
- `public/`: optional demo pages/scripts (only served when enabled)

