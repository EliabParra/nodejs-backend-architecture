# 05 — Contrato API (cliente-servidor)

Los endpoints API están definidos en [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js).

## Convención de respuesta

La mayoría de las respuestas siguen este shape (no siempre vienen todos los campos):

```json
{
    "code": 200,
    "msg": "...",
    "data": {},
    "alerts": []
}
```

- `code`: se usa también como HTTP status.
- `msg`: mensaje para UI.
- `data`: payload opcional (depende del BO).
- `alerts`: lista opcional de mensajes de validación (cuando falla `Validator`).

Un cliente típico muestra `alerts` si existen; si no, muestra `msg`.
Para ver recomendaciones de implementación: [docs/es/11-frontend-clients-and-requests.md](11-frontend-clients-and-requests.md).
Para ver el cliente demo incluido: [docs/es/12-examples.md](12-examples.md).

Nota: si el cliente envía un `Content-Type: application/json` pero el body no es JSON válido, el servidor normaliza la respuesta a:

- `400 invalidParameters` + `alerts` (en formato JSON, no HTML).

Nota: de forma general, cualquier error no controlado también se normaliza a JSON siguiendo el contrato (no se devuelven páginas HTML).

Implementación del handler final de errores:

- [src/express/middleware/final-error-handler.js](../../src/express/middleware/final-error-handler.js)

Nota: si el body excede `config.app.bodyLimit`, el servidor puede responder:

- `413 payloadTooLarge`

## Correlación (requestId)

Cada request recibe un identificador único y el servidor responde el header:

- `X-Request-Id: <uuid>`

Úsalo para depurar/soporte: si ves un error en cliente, reporta ese `requestId` y podrás encontrar el log correspondiente.

## Health y readiness

Estos endpoints sirven para monitoreo (health checks) y readiness (dependencias listas):

- `GET /health`: siempre responde `200` si el proceso está vivo.
    - Body ejemplo: `{ ok: true, name, uptimeSec, time, requestId }`
- `GET /ready`: responde `200` solo cuando el backend está listo para recibir tráfico.
    - Hoy valida (a nivel servidor):
        - `security.isReady` (carga del modelo de seguridad)
        - conectividad con DB (`SELECT 1`)
    - Si alguna dependencia no está lista, responde `503 serviceUnavailable`.

Implementación:

- [src/express/handlers/health.js](../../src/express/handlers/health.js)
- [src/express/handlers/ready.js](../../src/express/handlers/ready.js)

## Logging de requests

Además de loguear errores, el servidor registra requests al terminar la respuesta:

- Mensaje: `METHOD /path STATUS` (ej. `GET /health 200`)
- Contexto (`ctx`) estandarizado:
    - `requestId`, `method`, `path`, `status`, `durationMs`
    - y si existe sesión: `user_id`, `profile_id`

Esto te permite:

- medir latencias (sin APM)
- correlacionar logs con el header `X-Request-Id`
- auditar tráfico básico en dev

El output se controla con `config.log.activation`.

Implementación:

- requestId: [src/express/middleware/request-id.js](../../src/express/middleware/request-id.js)
- completion logger: [src/express/middleware/request-logger.js](../../src/express/middleware/request-logger.js)

Notas:

- Requests `2xx/3xx` se loguean como `info`.
- Requests `4xx/5xx` se loguean como `warning` **solo si** no fueron logueados previamente como error (para evitar duplicados).
- Puedes emitir logs como JSON (para producción) con `LOG_FORMAT=json` (ver [docs/es/03-configuration.md](03-configuration.md)).

## Auditoría (DB)

Además del logging a stdout, el backend puede registrar eventos en DB si existe `security.audit_log`:

- `login` / `logout`
- `/toProccess`: `tx_exec`, `tx_denied`, `tx_error`

Esto se inserta de forma best-effort (si falla, no rompe el request). El `requestId` se persiste como `request_id`.

Helper (best-effort): [src/BSS/helpers/audit-log.js](../../src/BSS/helpers/audit-log.js)

## CORS + sesión (frontend en otro puerto)

Si usas React/Vite/Angular en otro puerto (ej. `http://localhost:5173`) y mantienes sesión por cookie (como en esta arquitectura), necesitas:

1. Backend: permitir el origen en `config.cors.origins` y `config.cors.credentials=true` (ver [docs/es/03-configuration.md](03-configuration.md)).
2. Frontend: enviar cookies explícitamente.

Ejemplo con `fetch`:

```js
fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
})
```

Para `/toProccess` igual: `credentials: 'include'`.

## CSRF (sesión por cookie)

Como este backend usa sesión por cookie, los requests `POST` requieren un token CSRF.

1. Obtén el token:

- `GET /csrf` → `{ "csrfToken": "..." }`

2. En cada `POST`, envía el header:

- `X-CSRF-Token: <csrfToken>`

Si falta o es inválido, el servidor responde:

- `403 csrfInvalid`

Nota: `/toProccess` y `/logout` siguen respondiendo `401 login` si no existe sesión.

Implementación:

- [src/express/middleware/csrf.js](../../src/express/middleware/csrf.js)

## POST /login

Archivo: [src/BSS/Session.js](../../src/BSS/Session.js)

### Request

```json
{ "username": "...", "password": "..." }
```

Validaciones:

- `username`: `string`
- `password`: length mínimo 8

Validación de esquema (shape):

- `body` debe ser un objeto JSON.
- `username` y `password` deben ser `string`.
- Si falla: `400 invalidParameters` + `alerts`.

Implementación de validación de esquema HTTP (reutilizable):

- [src/BSS/helpers/http-validators.js](../../src/BSS/helpers/http-validators.js)

Si el body llega como JSON inválido, también se responde `400 invalidParameters` + `alerts`.

CSRF:

- Requiere `X-CSRF-Token` (ver sección CSRF).

### Response

- Éxito: `200` con `msgs[lang].success.login`
- Verificación requerida (2 pasos en dispositivo nuevo, opcional): `202` con `msgs[lang].success.loginVerificationRequired`
    - Incluye: `challengeToken` y `sentTo` (email enmascarado)
- Errores comunes:
    - `400 invalidParameters` + `alerts` (si falla validación)
    - `401 sessionExists` (si ya hay sesión)
    - `401 usernameOrPasswordIncorrect`
    - `403 emailNotVerified` (cuando `AUTH_REQUIRE_EMAIL_VERIFICATION=1`)
    - `409 emailRequired` (cuando `AUTH_REQUIRE_EMAIL_VERIFICATION=1` y el usuario no tiene email)
    - `429 tooManyRequests` (si hay demasiados intentos en ventana de tiempo)

Notas:

- Puedes configurar si `username` se interpreta como email o usuario con `AUTH_LOGIN_ID`.
- El `202` ocurre solo cuando `AUTH_LOGIN_2STEP_NEW_DEVICE=1` y el dispositivo no es de confianza.

## POST /login/verify

Archivo: [src/BSS/Session.js](../../src/BSS/Session.js)

Completa el desafío de login de 2 pasos iniciado por `POST /login`.

### Request

```json
{ "token": "<challengeToken>", "code": "<código-6-dígitos>" }
```

CSRF:

- Requiere `X-CSRF-Token` (ver sección CSRF).

### Response

- Éxito: `200` con `msgs[lang].success.login`
    - También crea la sesión y emite una cookie HttpOnly de dispositivo para confiar este browser.
- Errores comunes:
    - `400 invalidParameters` + `alerts`
    - `401 sessionExists`
    - `401 invalidToken` / `401 expiredToken`
    - `403 emailNotVerified` (cuando `AUTH_REQUIRE_EMAIL_VERIFICATION=1`)
    - `429 tooManyRequests` (demasiados intentos)

### Rate limiting (anti brute-force)

El endpoint `/login` está protegido con rate limiting. El limiter se define en [src/express/rate-limit/limiters.js](../../src/express/rate-limit/limiters.js) y se aplica desde [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js). Cuando se excede el límite, devuelve:

- HTTP `429`
- Body: `msgs[lang].errors.client.tooManyRequests`

## POST /logout

Archivo: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

### Request

No requiere un body específico (el frontend envía `{ msg: "logout" }`).

Validación de esquema (shape):

- Si se envía `body`, debe ser un objeto JSON.
- Si falla: `400 invalidParameters` + `alerts`.

Si el body llega como JSON inválido, también se responde `400 invalidParameters` + `alerts`.

CSRF:

- Requiere `X-CSRF-Token`.

### Response

- Si hay sesión: `200` con `msgs[lang].success.logout`
- Si no hay sesión: `401` con `msgs[lang].errors.client.login`

## POST /toProccess

Archivo: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

### Request

```json
{ "tx": 53, "params": {} }
```

- `tx`: número que se mapea a `(object_na, method_na)` usando `security.method` (ver [docs/es/04-database-security-model.md](04-database-security-model.md)).
- `params`: se pasa directo al método del BO.

### Validación de esquema (shape)

Antes de ejecutar permisos/BO, el servidor valida el **shape** del body:

- `body` debe ser un objeto JSON.
- `tx` debe ser un entero positivo.
- `params` (si viene) debe ser `string`, `number`, `object` o `null` (no array).

Si falla, responde:

- `400 invalidParameters`
- `alerts: []` con detalles del campo.

Si el body llega como JSON inválido, también se responde `400 invalidParameters` + `alerts`.

### Reglas

1. Si existe sesión, el request se ejecuta con `req.session.profile_id`.
2. Si NO existe sesión, el servidor puede ejecutar opcionalmente como **perfil público** cuando `AUTH_PUBLIC_PROFILE_ID` está configurado.
    - Esto habilita flujos anónimos (p. ej. registro/reset) manteniendo control por permisos.
3. Debe existir el `tx`.
4. Debe existir permiso para el `profile_id` efectivo.

CSRF:

- Autenticado: requiere `X-CSRF-Token`.
- Anónimo (perfil público): CSRF no se exige (se preserva el comportamiento histórico cuando no hay sesión autenticada).

### Response

- Si falla sesión: `401` con `msgs[lang].errors.client.login`
- Si seguridad (tx/permisos) no está lista: `503 serviceUnavailable`
- Si falla permiso: `401` con `permissionDenied`
- Si falla tx: se loguea y responde `unknown` (en el código actual, el detalle queda en log)
- Si el BO retorna `{ code, ... }`, el dispatcher usa ese `code` como status.

### Rate limiting (protección de carga)

`/toProccess` tiene rate limiting. El limiter se define en [src/express/rate-limit/limiters.js](../../src/express/rate-limit/limiters.js) y se aplica desde [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js).

- Límite: 120 requests por minuto.
- Key:
    - si existe sesión: por `user_id`
    - si no existe sesión: por IP
- Cuando se excede: HTTP `429` con `msgs[lang].errors.client.tooManyRequests`.

## Ejemplos

Los valores concretos de `tx` dependen de tu proyecto (lo que exista en `security.method.tx_nu`).

Si quieres ver ejemplos completos (incluyendo UI/cliente de ejemplo y tx de demo), ver:

- [docs/es/11-frontend-clients-and-requests.md](11-frontend-clients-and-requests.md)
- [docs/es/12-examples.md](12-examples.md)
