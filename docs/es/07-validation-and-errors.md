# 07 — Validación y manejo de errores

## Validator (alerts)

Implementación: [src/BSS/Validator.ts](../../src/BSS/Validator.ts)

El validador expone:

- `v.validateAll(params, types) -> boolean`
- `v.getAlerts() -> string[]`

### Cómo se pasan parámetros (convención)

Puedes pasar valores simples o objetos con metadata:

- Simple: `"hola"`
- Con label: `{ value: 10, label: "El id" }`
- Con length: `{ value: "abc", min: 3, max: 30, label: "El nombre" }`

Si falla, `Validator` arma `alerts` usando plantillas de [src/config/messages.json](../../src/config/messages.json) (`msgs[lang].alerts`).

### Estructura de ejemplo (genérica)

- Labels por idioma: `BO/<ObjectName>/messages/<objectName>Alerts.json`
- Uso: `BO/<ObjectName>/<ObjectName>Validate.ts`

## Validación de esquema HTTP (Dispatcher/Session)

Además del `Validator` usado en BO, el servidor valida el **shape** de algunos requests HTTP (por ejemplo `/login`, `/logout`, `/toProccess`) antes de ejecutar lógica.

Implementación:

- [src/BSS/helpers/http-validators.ts](../../src/BSS/helpers/http-validators.ts)

Esto produce `alerts` con labels (`body`, `username`, `password`, etc.) usando las plantillas del `Validator`.

## Errores por dominio (pattern)

Ejemplo: `<ObjectName>`.

- Mensajes del dominio en JSON: `BO/<ObjectName>/messages/<objectName>ErrorMsgs.json`
- Handler que normaliza: `BO/<ObjectName>/<ObjectName>ErrorHandler.ts`

Convención:

- Un handler expone funciones como `XNotFound()`, `XInvalidParameters(alerts)`, `XUnauthorized()`, `UnknownError()`.
- Un error de validación incluye `alerts: []`.

Esto permite que el BO devuelva directamente el objeto de error y el dispatcher lo use como respuesta.

## Errores de infraestructura

### DB

[src/BSS/DBComponent.ts](../../src/BSS/DBComponent.ts) ejecuta queries desde `queries[schema][queryName]`.

- En caso de excepción, loguea y **lanza** un `Error` (no devuelve `null`).
- Por diseño, los modelos/BO deben asumir que `await db.exe(...)` puede lanzar y deben manejarlo con `try/catch`.

Patrón recomendado:

```ts
try {
    const r = await db.exe('schema', 'queryName', [
        /* params */
    ])
    // usar r.rows
} catch (err) {
    // error de infraestructura (DB), responder con error estándar
    return personErrors.UnknownError() // o msgs[lang].errors.client.unknown
}
```

### Dispatcher

[src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts)

- En `/toProccess`, ante exception responde `msgs[lang].errors.client.unknown`.
- Los detalles quedan en log (`log.show(TYPE_ERROR, ...)`).

El handler final que normaliza errores no controlados vive en:

- [src/express/middleware/final-error-handler.ts](../../src/express/middleware/final-error-handler.ts)

## Recomendación de consistencia (regla interna)

En esta arquitectura, un método BO debería retornar **siempre** un objeto con `code` y `msg` (y opcionalmente `data/alerts`) para mantener un contrato estable con el frontend.
