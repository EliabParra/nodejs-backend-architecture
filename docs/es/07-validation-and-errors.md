# 07 — Validación y manejo de errores

## Validator (alerts)

Implementación: [src/BSS/Validator.js](../../src/BSS/Validator.js)

El validador expone:

- `v.validateAll(params, types) -> boolean`
- `v.getAlerts() -> string[]`

### Cómo se pasan parámetros (convención)

Puedes pasar valores simples o objetos con metadata:

- Simple: `"hola"`
- Con label: `{ value: 10, label: "El id" }`
- Con length: `{ value: "abc", min: 3, max: 30, label: "El nombre" }`

Si falla, `Validator` arma `alerts` usando plantillas de [src/config/messages.json](../../src/config/messages.json) (`msgs[lang].alerts`).

### Ejemplo real (Person)

- Labels por idioma en [BO/Person/errors/personAlerts.json](../../BO/Person/errors/personAlerts.json)
- Uso en [BO/Person/PersonValidate.js](../../BO/Person/PersonValidate.js)

## Errores por dominio (pattern)

Ejemplo: `Person`.

- Mensajes del dominio en JSON: [BO/Person/errors/personErrorMsgs.json](../../BO/Person/errors/personErrorMsgs.json)
- Handler que normaliza: [BO/Person/errors/PersonErrorHandler.js](../../BO/Person/errors/PersonErrorHandler.js)

Convención:

- Un handler expone funciones como `XNotFound()`, `XInvalidParameters(alerts)`, `XUnauthorized()`, `UnknownError()`.
- Un error de validación incluye `alerts: []`.

Esto permite que el BO devuelva directamente el objeto de error y el dispatcher lo use como respuesta.

## Errores de infraestructura

### DB

[src/BSS/DBComponent.js](../../src/BSS/DBComponent.js) ejecuta queries desde `queries[schema][queryName]`.

- En caso de excepción, loguea y devuelve `null`.
- Por diseño actual, los modelos/BO deberían contemplar que `db.exe(...)` pueda retornar `null`.

### Dispatcher

[src/BSS/Dispatcher.js](../../src/BSS/Dispatcher.js)

- En `/toProccess`, ante exception responde `msgs[lang].errors.client.unknown`.
- Los detalles quedan en log (`log.show(TYPE_ERROR, ...)`).

## Recomendación de consistencia (regla interna)

En esta arquitectura, un método BO debería retornar **siempre** un objeto con `code` y `msg` (y opcionalmente `data/alerts`) para mantener un contrato estable con el frontend.
