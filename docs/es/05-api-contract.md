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

El cliente ejemplo muestra `alerts` si existen; si no, muestra `msg` (ver [public/js/Sender.js](../../public/js/Sender.js)).

## POST /login

Archivo: [src/BSS/Session.js](../../src/BSS/Session.js)

### Request

```json
{ "username": "...", "password": "..." }
```

Validaciones:

- `username`: `string`
- `password`: length mínimo 8

### Response

- Éxito: `200` con `msgs[lang].success.login`
- Errores comunes:
  - `400 invalidParameters` + `alerts` (si falla validación)
  - `401 sessionExists` (si ya hay sesión)
  - `401 usernameOrPasswordIncorrect`

## POST /logout

Archivo: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

### Request

No requiere un body específico (el frontend envía `{ msg: "logout" }`).

### Response

- Si hay sesión: `200` con `msgs[lang].success.logout`
- Si no hay sesión: `401` con `msgs[lang].errors.client.login`

## POST /toProccess

Archivo: [src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

### Request

```json
{ "tx": 53, "params": { } }
```

- `tx`: número que se mapea a `(object_na, method_na)` usando `security.method` (ver [docs/es/04-database-security-model.md](04-database-security-model.md)).
- `params`: se pasa directo al método del BO.

### Reglas

1. Debe existir sesión (`req.session.user_id`).
2. Debe existir el `tx`.
3. Debe haber permiso para el `profile_id` actual.

### Response

- Si falla sesión: `401` con `msgs[lang].errors.client.login`
- Si falla permiso: `401` con `permissionDenied`
- Si falla tx: se loguea y responde `unknown` (en el código actual, el detalle queda en log)
- Si el BO retorna `{ code, ... }`, el dispatcher usa ese `code` como status.

## Ejemplo (frontend)

El frontend usa estos tx (ver [public/js/scripts.js](../../public/js/scripts.js)):

- `53`: get (params = id o nombre)
- `63`: create (params = `{ person_na, person_ln }`)
- `73`: update (params = `{ person_id, person_na, person_ln }`)
- `83`: delete (params = id o nombre)

> Nota: esos números existen solo si están cargados en `security.method.tx_nu`.
