<div align="center">

# Node.js Backend Architecture (Template)

Template de backend para Node.js (ESM) + Express 5, diseñado para proyectos reales.

[![Node.js (ESM)](https://img.shields.io/badge/Node.js-ESM-3c873a?style=for-the-badge)](#)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-336791?style=for-the-badge)](#)
[![Tests](https://img.shields.io/badge/Tests-node%20--test-2f6feb?style=for-the-badge)](#)

</div>

## Qué es este repositorio

Este repo es un **template de backend** pensado para ser fácil de extender y seguro como base para proyectos reales.

- **Por defecto es API-only** (`APP_FRONTEND_MODE=none`).
- Los **demos/ejemplos son opcionales** y viven aislados en `examples/` y `public/`.

## Objetivo y audiencia

**Objetivos**
- Dar una base limpia: config, modelo de seguridad, sesión, endpoints de health/readiness.
- Estandarizar el flujo completo: request → seguridad (`tx` + permisos) → ejecución BO → validación → respuesta JSON normalizada.
- Soportar cualquier frontend: SPA separada, `pages` (legacy) o servir un build SPA.

**Audiencia**
- Desarrolladores que quieran una base estable y consistente.
- Equipos que necesiten un starter backend con límites claros y demos opcionales.
- Proyectos internos (B2B/admin) donde sesiones/cookies y CSRF sean el camino.

## Conceptos clave

- **BO (Business Object)** vive en `BO/<ObjectName>/`.
- Un endpoint transaccional **`POST /toProccess`** ejecuta operaciones identificadas por `tx`.
- El schema **`security`** guarda mapeo de `tx` + reglas de permisos.

## Quickstart

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

## Documentación (ES)

Empieza aquí:
- Índice ES: [docs/es/00-index.md](docs/es/00-index.md)
- Tutorial Frontend (ES): [docs/es/11-frontend-clients-and-requests.md](docs/es/11-frontend-clients-and-requests.md)
- Ejemplos (ES): [docs/es/12-examples.md](docs/es/12-examples.md)

## Scripts

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

## BO/ (tu dominio)

La carpeta `BO/` se mantiene **vacía por diseño**.

- Agrega tus BOs en `BO/<ObjectName>/<ObjectName>BO.js`.
- Scaffold rápido: `npm run bo -- new ObjectName`.
- BOs demo (opcional): `examples/bo-demo/BO/`.
