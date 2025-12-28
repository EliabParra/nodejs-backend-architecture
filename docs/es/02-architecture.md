# 02 — Arquitectura y flujo de ejecución

## Estructura por capas

- **Cliente (estático)**: `public/` (HTML/CSS/JS)
- **Router de páginas**: `src/router/` (sirve HTML y protege rutas)
- **Dispatcher (API)**: `src/BSS/Dispatcher.js` (endpoints `/login`, `/logout`, `/toProccess`)
- **BSS (servicios transversales)**: `src/BSS/` (DB, session, security, validator, log)
- **BO (negocio)**: `BO/` (ejemplo `BO/Person/`)
- **Config**: `src/config/` (config runtime, mensajes, queries SQL)

## Bootstrap (arranque)

1. [src/index.js](../../src/index.js)
   - Importa [src/globals.js](../../src/globals.js)
   - Importa [src/router/routes.js](../../src/router/routes.js) (define rutas de páginas)
   - Crea `new Dispatcher()` y llama `serverOn()`

2. [src/globals.js](../../src/globals.js)
   - Carga JSON via `require` (config, queries, messages)
   - Crea singletons globales:
     - `globalThis.v` (Validator)
     - `globalThis.log` (Log)
     - `globalThis.db` (DBComponent)
     - `globalThis.security` (Security)

**Importante**: tu arquitectura usa `globalThis` como “service locator”. Por diseño actual, BO/BSS consumen `config`, `msgs`, `queries`, `db`, `v`, `log`, `security` como globals.

## Flujo del request (API transaccional)

### Endpoint

- `POST /toProccess` definido en [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

### Secuencia (alto nivel)

1. **Verificar sesión**
   - `Session.sessionExists(req)` en [src/BSS/Session.js](../../src/BSS/Session.js)
2. **Resolver tx → (object_na, method_na)**
   - `security.getDataTx(body.tx)` usando `txMap` precargado en [src/BSS/Security.js](../../src/BSS/Security.js)
3. **Validar permisos**
   - `security.getPermissions({ profile_id, method_na, object_na })` contra `permission` precargado
4. **Ejecutar BO**
   - `security.executeMethod({ object_na, method_na, params })`
   - Import dinámico del BO: `../../BO/<object_na>/<object_na>BO.js` (ver `config.bo.path` en [src/config/config.json](../../src/config/config.json))
5. **Responder**
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

## Router de páginas

- Declaración de rutas en [src/router/routes.js](../../src/router/routes.js)
- Router y middleware `requireAuth` en [src/router/pages.js](../../src/router/pages.js)
- `/content` requiere sesión; si no existe, redirige a `/?returnTo=...`

## Contratos entre capas (regla práctica)

- **BSS** debe ser reusable y sin lógica de dominio.
- **BO** orquesta el dominio: valida, llama DB, arma mensajes y shape final de respuesta.
- **Modelo/entidad** (ejemplo `Person`) puede encapsular queries y reglas; el BO decide el mensaje de negocio.
