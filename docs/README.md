# Backend Architecture Docs

- Español: [docs/es/00-index.md](es/00-index.md)
- English: [docs/en/00-index.md](en/00-index.md)

## Scripts (npm)

Scripts del backend que puedes ejecutar desde la raíz del repo:

- `npm run start`: levanta el API server
- `npm run dev`: levanta el API server con `nodemon`
- `npm test`: corre la suite de tests DB-safe (`node --test`)
- `npm run db:init`: inicializa el schema `security` en Postgres (idempotente)
	- Docs: [ES](es/11-db-init.md) / [EN](en/11-db-init.md)
- `npm run bo -- <command>`: CLI de BO (genera BOs, sincroniza tx, maneja permisos)
	- Docs: [ES](es/09-bo-cli-and-permissions.md) / [EN](en/09-bo-cli-and-permissions.md)
- `npm run hashpw -- "<plainPassword>" [saltRounds]`: genera un hash de contraseña para seed/admin
	- Getting started: [ES](es/01-getting-started.md) / [EN](en/01-getting-started.md)
- `npm run full`: helper opcional de dev para levantar backend + frontend usando `FRONTEND_PATH`
	- Docs: [ES](es/10-frontend-clients-and-requests.md) / [EN](en/10-frontend-clients-and-requests.md)

## JSDoc

- Generar documentación API: `npm run docs:jsdoc`
- Output: `docs/api/` (se genera localmente; está ignorado por git)

## Starterpack (export limpio)

Este repo puede contener BOs y páginas de ejemplo para desarrollo; si quieres un **template limpio** para iniciar proyectos desde cero, genera un export:

- Export por defecto a `.tmp-starterpack/`: `npm run export:starter`
- Export a una ruta específica: `npm run export:starter -- --out <ruta>`

El export incluye `src/`, `scripts/`, `docs/`, `test/`, `public/`, `.env.example`, etc., y crea un `BO/` vacío (sin BOs del ejemplo).
