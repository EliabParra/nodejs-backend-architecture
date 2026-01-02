# 02 — Arquitectura y flujo de ejecución

## Estructura por capas

- **Cliente (estático)**: `public/` (HTML/CSS/JS)
- **Router de páginas**: `src/router/` (sirve HTML y protege rutas)
- **Dispatcher (API)**: `src/BSS/Dispatcher.js` (endpoints `/login`, `/logout`, `/toProccess`)
- **Capa HTTP/Express (plumbing)**: `src/express/` (middlewares, handlers, session wiring)
- **BSS (servicios transversales)**: `src/BSS/` (DB, session, security, validator, log)
- **BO (negocio)**: `BO/` (ej. `BO/ObjectName/`).
    - BOs demo completos viven en `examples/bo-demo/BO/`.
- **Config**: `src/config/` (config runtime, mensajes, queries SQL)

## Bootstrap (arranque)

1. [src/index.js](../../src/index.js)
    - Importa [src/globals.js](../../src/globals.js)
    - Crea `new Dispatcher()`, ejecuta `await dispatcher.init()` y luego llama `serverOn()`

2. [src/globals.js](../../src/globals.js)
    - Carga JSON via `require` (config, queries, messages)
    - Crea singletons globales:
        - `globalThis.v` (Validator)
        - `globalThis.log` (Log)
        - `globalThis.db` (DBComponent)
        - `globalThis.security` (Security)

**Importante**: tu arquitectura usa `globalThis` como “service locator”. Por diseño actual, BO/BSS consumen `config`, `msgs`, `queries`, `db`, `v`, `log`, `security` como globals.

Nota: por consistencia con el diseño del repo, algunos módulos de `src/express/` también consumen globals (ej. `log`, `msgs`, `config`).

## Flujo del request (API transaccional)

### Endpoint

### Secuencia (alto nivel)

1. **Verificar sesión**
    - `Session.sessionExists(req)` en [src/BSS/Session.js](../../src/BSS/Session.js)
2. **Esperar inicialización de seguridad (race-free)**
    - `Security` precarga `txMap` y permisos desde DB.
    - `/toProccess` espera `security.ready` antes de usar `txMap` para evitar que llegue un request mientras el cache aún está vacío.
3. **Resolver tx → (object_na, method_na)**
    - `security.getDataTx(body.tx)` usando `txMap` precargado en [src/BSS/Security.js](../../src/BSS/Security.js)
4. **Validar permisos**
    - `security.getPermissions({ profile_id, method_na, object_na })` contra `permission` precargado
5. **Ejecutar BO**
    - `security.executeMethod({ object_na, method_na, params })`
    - Import dinámico del BO: `../../BO/<object_na>/<object_na>BO.js` (ver `config.bo.path` en [src/config/config.json](../../src/config/config.json))
6. **Responder**
    - `res.status(response.code).send(response)`

### Diagrama rápido

```
Client
  | POST /toProccess { tx, params }
  v
Dispatcher.toProccess
  |-- Session.sessionExists?
  |-- Security.getDataTx(tx)
  |-- Security.getPermissions(profile_id, method_na, object_na)
  |-- Security.executeMethod -> BO.<method>(params)
  v
Response { code, msg, data?, alerts? }
```

Nota sobre desacople: el backend puede correr en modo **API-only** (`APP_FRONTEND_MODE=none`). En ese modo, el código de hosting de páginas/SPAs se carga mediante un **adapter** (import dinámico) solo cuando el modo lo requiere, para que el core no importe módulos de UI.

Implementación del adapter:

- [src/frontend-adapters/index.js](../../src/frontend-adapters/index.js)

## Express plumbing (dónde vive ahora)

- Middlewares (helmet, CORS, parsers, CSRF, rate limit, requestId/log): `src/express/middleware/`
- Health/readiness handlers: `src/express/handlers/`
- Session wiring (express-session + store): [src/express/session/apply-session-middleware.js](../../src/express/session/apply-session-middleware.js)

El `Dispatcher` queda principalmente como orquestador: registra rutas, conecta middlewares y delega la configuración de Express a módulos chicos.

## Router de páginas

- Declaración de rutas en [src/router/routes.js](../../src/router/routes.js)
- Router y middleware `requireAuth` en [src/router/pages.js](../../src/router/pages.js)
- Se pueden proteger rutas por configuración de ruta (ej. `validateIsAuth=true`).
- Cuando se requiere auth y no hay sesión, redirige a `/?returnTo=...`.

## Contratos entre capas (regla práctica)

- **BSS** debe ser reusable y sin lógica de dominio.
- **BO** orquesta el dominio: valida, llama DB, arma mensajes y shape final de respuesta.
- **Modelo/entidad** (opcional) puede encapsular queries y reglas; el BO decide el mensaje de negocio.
