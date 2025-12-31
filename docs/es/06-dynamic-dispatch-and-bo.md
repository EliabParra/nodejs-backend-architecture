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

Estructura típica (placeholders):

- BO (orquestación + mensajes): `BO/<ObjectName>/<ObjectName>BO.js`
- Repositorio / modelo (DB): `BO/<ObjectName>/<ObjectName>.js`
- Validación: `BO/<ObjectName>/<ObjectName>Validate.js`
- Mensajes de éxito: `BO/<ObjectName>/<objectName>SuccessMsgs.json`
- Errores del dominio:
  - Handler: `BO/<ObjectName>/errors/<ObjectName>ErrorHandler.js`
  - Mensajes: `BO/<ObjectName>/errors/<objectName>ErrorMsgs.json`
  - Labels: `BO/<ObjectName>/errors/<objectName>Alerts.json`

Si quieres ver un ejemplo completo, revisa: [examples/bo-demo/BO](../../examples/bo-demo/BO)

## Firma y contrato del método BO

Un método BO recibe `params` (lo que venga en el request) y retorna un objeto con al menos:

- `code` (number)
- `msg` (string) en errores o en éxito (según el BO)
- opcionalmente `data` y/o `alerts`

Ejemplo:

- `<ObjectName>BO.<method>(params)` ejecuta la operación y retorna `{ data, msg, code }`.

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

- Guía: [docs/es/09-bo-cli.md](09-bo-cli.md)

Ejemplos rápidos:

- Crear BO: `npm run bo -- new ObjectName --methods getObject,createObject,updateObject,deleteObject`
- Mapear a DB (tx): `npm run bo -- sync ObjectName --txStart <n>`
- Asignar permisos: `npm run bo -- perms --profile <profileId> --allow ObjectName.getObject,ObjectName.createObject`

Si quieres ver un ejemplo completo funcionando (BOs demo + estructura), ver:

- [docs/es/12-examples.md](12-examples.md)

## Nota sobre `config.bo.path`

`config.bo.path` (en [src/config/config.json](../../src/config/config.json)) es una ruta relativa usada por `import()` desde [src/BSS/Security.js](../../src/BSS/Security.js). Si mueves carpetas, este valor debe mantenerse consistente.
