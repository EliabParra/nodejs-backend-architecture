# Documentación (ES)

Estas docs describen un **template backend (Node.js + Express)** para proyectos reales: una base API-first, con seguridad por `tx` + permisos, y ejemplos **opcionales** aislados.

## Qué es

Un backend de referencia que muestra un patrón de arquitectura (dispatcher transaccional + BOs) y un “starter” práctico (config, DB init, health/ready, tests DB-safe).

## Objetivo

- Servir como base reutilizable para proyectos (sin acoplarlo a un “demo” específico).
- Estandarizar un flujo completo: request → seguridad → BO → validación → respuesta.
- Permitir integrar cualquier frontend (SPA separada, `pages`, o `spa` con build).

## Audiencia

- Desarrolladores: extender el backend (crear BOs, mapear `tx`, asignar permisos).
- Equipos: usarlo como punto de partida para un backend real.

## Principios

- **API-only por defecto** (`APP_FRONTEND_MODE=none`).
- **Demos aislados** en `examples/` y `public/` (ver el capítulo de Ejemplos).
- Contrato JSON consistente + errores normalizados.

## Mapa rápido

- **Entrada del servidor**: [src/index.js](../../src/index.js)
- **Globals (service locator)**: [src/globals.js](../../src/globals.js)
- **Dispatcher (Express + endpoints)**: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)
- **Express plumbing (middlewares/handlers/session wiring)**: `src/express/`
    - Middlewares: [src/express/middleware/](../../src/express/middleware/)
    - Handlers: [src/express/handlers/](../../src/express/handlers/)
    - Session wiring: [src/express/session/apply-session-middleware.js](../../src/express/session/apply-session-middleware.js)
- **Seguridad (tx + permisos + BO dinámico)**: [src/BSS/Security.js](../../src/BSS/Security.js)
- **Sesión (express-session)**: [src/BSS/Session.js](../../src/BSS/Session.js)
- **DB**: [src/BSS/DBComponent.js](../../src/BSS/DBComponent.js)
- **Validación (alerts)**: [src/BSS/Validator.js](../../src/BSS/Validator.js)
- **Helpers compartidos (BSS)**: [src/BSS/helpers/](../../src/BSS/helpers/)
- **Router de páginas**: [src/router/pages.js](../../src/router/pages.js)
- **Ejemplos incluidos (cliente/pages/demo BO)**: ver [docs/es/12-examples.md](12-examples.md)

## Índice

1. [Cómo correr el proyecto](01-getting-started.md)
2. [Arquitectura y flujo de ejecución](02-architecture.md)
3. [Configuración, mensajes y queries](03-configuration.md)
4. [Modelo de seguridad (schema `security`)](04-database-security-model.md)
5. [Contrato API (cliente-servidor)](05-api-contract.md)
6. [Cómo crear un BO (dispatch dinámico)](06-dynamic-dispatch-and-bo.md)
7. [Validación y manejo de errores](07-validation-and-errors.md)
8. [Páginas y sesión](08-pages-and-session.md)
9. [CLI para BO + tx + permisos](09-bo-cli.md)
10. [DB init CLI (schema `security`)](10-db-init-cli.md)
11. [Frontend clients y requests](11-frontend-clients-and-requests.md)
12. [Ejemplos incluidos (opcional)](12-examples.md)
13. [Autenticación (módulo Auth)](13-autenticacion.md)

## Glosario

- **BSS** (_Basic Subsystem_): servicios transversales en `src/BSS/` (DB, seguridad, sesión, logging, validación, dispatcher).
- **BO** (_Business Object_): módulos de negocio en `BO/` (por entidad/feature). Se cargan dinámicamente desde `Security`.
- **tx**: número de transacción enviado por el cliente (`body.tx`) para resolver qué método ejecutar.
- **object_na**: nombre lógico del objeto BO (p.ej. `<ObjectName>`). Se usa para ubicar archivos y para permisos.
- **method_na**: nombre del método a invocar (p.ej. `<methodName>`).
- **alerts**: lista de mensajes de validación generados por `Validator` (vía `v.getAlerts()`).
