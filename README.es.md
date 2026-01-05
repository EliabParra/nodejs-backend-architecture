<div align="center">

<picture>
	<source media="(prefers-color-scheme: dark)" srcset="assets/branding/toproc-logo.light.svg" />
	<img alt="Toproc" src="assets/branding/toproc-logo.dark.svg" width="100" />
</picture>

_**ToProccess core**: tx-driven secure dispatch backend._

[![Node.js (ESM)](https://img.shields.io/badge/Node.js-ESM-3c873a?style=for-the-badge)](#)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-336791?style=for-the-badge)](#)
[![Tests](https://img.shields.io/badge/Tests-node%20--test-2f6feb?style=for-the-badge)](#)
[![CI](https://img.shields.io/github/actions/workflow/status/EliabParra/toproc/ci.yml?branch=master&style=for-the-badge)](https://github.com/EliabParra/toproc/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/License-MIT-2f6feb?style=for-the-badge)](LICENSE)

</div>

**English:** see [README.md](README.md)

Toproc es una arquitectura backend developer-first construida alrededor del core **ToProccess**. Te da una base sólida (modelo de seguridad + tooling) sin forzarte a un framework completo.

## Highlights

- Sesiones por cookie con store en Postgres + protección CSRF (diseñado para web apps).
- Ejecución estilo RPC/transaccional vía `POST /toProccess` (`tx` → permisos → método BO).
- Modelo de permisos en DB (schema `security`) con CLIs para init + BO sync + permisos.
- Bases operativas incluidas: `/health`, `/ready`, request IDs, errores JSON consistentes.
- Hosting de frontend opcional (`none`/`pages`/`spa`) con orden seguro.
- Runtime TypeScript-first (ESM) con `strict: true` y un seam DI-friendly (`AppContext`).

## Para quién es

- Apps internas (B2B/admin) que necesitan sesiones por cookie + CSRF.
- Equipos que quieren una base mantenible con puntos de extensión claros.

## TypeScript-first + DI (qué esperar)

- **TypeScript-first**: el source-of-truth es `src/**/*.ts` y el typecheck estricto es parte del quality gate.
- **DI-friendly** (sin container pesado): los servicios de runtime viven en globals y también se agrupan en un `AppContext` creado por `createAppContext()`.

Empieza aquí:

- Tipos + DI: [docs/es/14-types-y-di.md](docs/es/14-types-y-di.md)

## Quickstart (10 minutos)

1. Instalar:

```bash
npm install
```

2. Configurar environment:

Copia `.env.example` a `.env` y configura Postgres (`DATABASE_URL` o `PG*`).

3. Inicializar DB (requerido):

```bash
npm run db:init
```

Docs (ES):

- DB init CLI: [docs/es/10-db-init-cli.md](docs/es/10-db-init-cli.md)

4. Ejecutar:

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

## Idea central (BO + tx)

- Tu lógica de negocio vive en módulos BO bajo `BO/<ObjectName>/<ObjectName>BO.js`.
- `security.methods` mapea `tx` → `(object_name, method_name)`.
- `security.permission_methods` controla qué perfiles pueden ejecutar qué métodos.

Scaffold de BO:

```bash
npm run bo -- new Order
```

Sync de métodos BO a DB (mapeo tx):

```bash
npm run bo -- sync Order --txStart 100
```

## Documentación (ES)

Empieza aquí:

- Índice ES: [docs/es/00-index.md](docs/es/00-index.md)
- Auth (ES): [docs/es/13-autenticacion.md](docs/es/13-autenticacion.md)
- Tutorial Frontend (ES): [docs/es/11-frontend-clients-and-requests.md](docs/es/11-frontend-clients-and-requests.md)

## Scripts

| Script                                             | Descripción                                          |
| -------------------------------------------------- | ---------------------------------------------------- |
| `npm start`                                        | Levanta el API server                                |
| `npm test`                                         | Tests DB-safe (Node test runner)                     |
| `npm run dev`                                      | Levanta con `nodemon`                                |
| `npm run format`                                   | Formatea el repo (Prettier)                          |
| `npm run format:check`                             | Verifica formato (ideal para CI)                     |
| `npm run test:watch`                               | Corre tests en modo watch                            |
| `npm run test:coverage`                            | Genera cobertura (c8)                                |
| `npm run verify`                                   | Quality gate: typecheck + build + dist smoke + tests |
| `npm run db:init`                                  | Inicializa schema `security` (idempotente)           |
| `npm run bo -- <command>`                          | CLI BO (scaffold, sync tx, permisos)                 |
| `npm run hashpw -- "<plainPassword>" [saltRounds]` | Genera hashes bcrypt                                 |
| `npm run export:starter`                           | Export limpio                                        |

Nota de cobertura: `c8` está configurado para enfocarse en lógica de runtime (`src/**/*.ts`) y excluye wiring/entrypoints (p. ej. `src/index.ts`) y docs/scripts/BO.

## BO/ (tu dominio)

La carpeta `BO/` se mantiene **vacía por diseño**.

- Agrega tus BOs en `BO/<ObjectName>/<ObjectName>BO.js`.
- Scaffold rápido: `npm run bo -- new ObjectName`.

## Licencia

MIT. Ver [LICENSE](LICENSE).
