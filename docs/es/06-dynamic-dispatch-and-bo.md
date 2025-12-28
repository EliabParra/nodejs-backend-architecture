# 06 — Dispatch dinámico y cómo crear un BO

Esta arquitectura ejecuta lógica de negocio sin rutas REST por recurso: ejecuta métodos en BO mediante un **dispatcher transaccional**.

## Cómo se resuelve y ejecuta un BO

Implementación: [src/BSS/Security.js](../../src/BSS/Security.js)

- El servidor recibe `{ tx, params }`.
- `tx` se traduce a `{ object_na, method_na }` usando `Security.txMap`.
- `Security.executeMethod()` construye el path del módulo:

```js
const modulePath = `${config.bo.path}${object_na}/${object_na}BO.js`
const c = await import(modulePath)
const instance = new c[`${object_na}BO`]()
return await instance[method_na](params)
```

Además, cachea instancias por `"object_na_method_na"` en `Security.instances`.

## Reglas obligatorias de naming

Para que el import dinámico funcione:

1. Debe existir carpeta: `BO/<object_na>/`
2. Debe existir archivo: `BO/<object_na>/<object_na>BO.js`
3. Ese archivo debe exportar la clase exacta: `export class <object_na>BO { ... }`
4. La clase debe tener el método exacto: `<method_na>(params)`
5. En DB, `security.object.object_na` y `security.method.method_na` deben coincidir con los strings anteriores.

## Estructura recomendada de un BO

Ejemplo real: `BO/Person/`

- BO (orquestación + mensajes): [BO/Person/PersonBO.js](../../BO/Person/PersonBO.js)
- Modelo/entidad (DB + validación): [BO/Person/Person.js](../../BO/Person/Person.js)
- Reglas de validación: [BO/Person/PersonValidate.js](../../BO/Person/PersonValidate.js)
- Errores del dominio (mensaje + code + alerts):
  - Handler: [BO/Person/errors/PersonErrorHandler.js](../../BO/Person/errors/PersonErrorHandler.js)
  - Mensajes: [BO/Person/errors/personErrorMsgs.json](../../BO/Person/errors/personErrorMsgs.json)
  - Labels para alerts: [BO/Person/errors/personAlerts.json](../../BO/Person/errors/personAlerts.json)

## Firma y contrato del método BO

Un método BO recibe `params` (lo que venga en el request) y retorna un objeto con al menos:

- `code` (number)
- `msg` (string) en errores o en éxito (según el BO)
- opcionalmente `data` y/o `alerts`

Ejemplo:

- `PersonBO.getPerson(value)` llama `Person.get(value)` y si ok retorna `{ data: result, msg: ..., code: 200 }`.

## Checklist para agregar una nueva feature

1. Crear `BO/<object_na>/` y el archivo `BO/<object_na>/<object_na>BO.js`.
2. Implementar clase `export class <object_na>BO` con métodos `method_na`.
3. Crear (opcional pero recomendado) `BO/<object_na>/<object_na>.js` y `<object_na>Validate.js`.
4. Agregar queries al schema correspondiente en [src/config/queries.json](../../src/config/queries.json).
5. Registrar `object_na` y `method_na` + `tx_nu` en schema `security`. ver [docs/es/04-database-security-model.md](04-database-security-model.md).
6. Dar permisos al/los perfiles.
7. Consumir desde cliente enviando `{ tx, params }`.

## Forma recomendada (CLI)

Para evitar trabajo manual en DB y mantener el estándar de archivos, usa el CLI:

- Guía: [docs/es/09-bo-cli-and-permissions.md](09-bo-cli-and-permissions.md)

Ejemplos rápidos:

- Crear BO: `npm run bo -- new Order --methods getOrder,createOrder,updateOrder,deleteOrder`
- Mapear a DB (tx): `npm run bo -- sync Order --txStart 200`
- Asignar permisos: `npm run bo -- perms --profile 2 --allow Order.getOrder,Order.createOrder`

## Nota sobre `config.bo.path`

`config.bo.path` (en [src/config/config.json](../../src/config/config.json)) es una ruta relativa usada por `import()` desde [src/BSS/Security.js](../../src/BSS/Security.js). Si mueves carpetas, este valor debe mantenerse consistente.
