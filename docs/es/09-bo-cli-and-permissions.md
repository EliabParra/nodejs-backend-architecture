# 09 — CLI para BO + tx + permisos (sin tocar DB manualmente)

Este repo incluye un CLI para:

- Crear la estructura estándar de un BO (carpeta + archivos base).
- Registrar automáticamente en DB el `object_na`, `method_na` y el `tx_nu` (mapping de transacciones).
- Asignar/quitar permisos a perfiles (tabla `security.permission_method`).

El CLI vive en [scripts/bo.mjs](../../scripts/bo.mjs) y se ejecuta con `npm run bo`.

## Requisitos

- Tener acceso a la base de datos Postgres con el schema `security` creado.
- Variables de entorno o config DB listos (ver [docs/es/03-configuration.md](03-configuration.md)).
- Importante: `Security` cachea `tx`/permisos al iniciar. Después de cambios en DB, **reinicia el server**.

## Modelo que administra

El CLI trabaja con estas tablas (ya descritas en [docs/es/04-database-security-model.md](04-database-security-model.md)):

- `security.object(object_id, object_na)`
- `security.method(method_id, object_id, method_na, tx_nu)`
- `security.profile(profile_id)`
- `security.permission_method(profile_id, method_id)`

## Comandos

Todos los comandos se ejecutan así:

- `npm run bo -- <comando> [args] [opciones]`

### 1) Crear un BO: `new`

Crea la estructura estándar de un BO con mensajes por BO.

Ejemplo (CRUD por defecto):

- `npm run bo -- new ObjectName`

Esto crea:

- `BO/ObjectName/ObjectNameBO.js`
- `BO/ObjectName/ObjectName.js` (entidad + `ObjectNameRepository`)
- `BO/ObjectName/ObjectNameValidate.js`
- `BO/ObjectName/objectNameSuccessMsgs.json`
- `BO/ObjectName/errors/ObjectNameErrorHandler.js`
- `BO/ObjectName/errors/objectNameErrorMsgs.json`
- `BO/ObjectName/errors/objectNameAlerts.json`

Ejemplo (métodos personalizados):

- `npm run bo -- new ObjectName --methods getObject,createObject,updateObject,deleteObject`

Opciones útiles:

- `--force`: sobrescribe archivos si ya existen.
- `--dry`: imprime lo que haría sin escribir archivos.

#### Crear y mapear en DB en una sola corrida (`--db`)

- `npm run bo -- new Order --db`

- `npm run bo -- new ObjectName --db`

El CLI:

1. Asegura/crea `security.object` (`object_na = "Order"`).
2. Inserta/actualiza filas en `security.method` para cada método.
3. Asigna `tx_nu` automáticamente desde `max(tx_nu)+1`.

Control de tx:

- `--txStart 200` para empezar desde un número.
- `--tx 201,202,203,204` para definir el tx exacto por método (debe coincidir con la cantidad de métodos).

### 2) Sincronizar métodos del BO a DB: `sync`

Lee `BO/<Object>/<Object>BO.js`, detecta los métodos y los registra/actualiza en `security.method`.

- `npm run bo -- sync ObjectName`

Opciones:

- `--txStart <n>` o `--tx <...>` para controlar los `tx_nu`.
- `--dry` para revisar el plan sin tocar DB.

Notas:

- La detección de métodos es estricta: solo se consideran “métodos de negocio” los declarados como `async <nombre>(...)`.
- En `sync`, se ignoran los métodos que empiezan con `_` (recomendado para helpers internos como `_mapRow`, `_normalize`).
- Evita declarar helpers `async` públicos dentro del BO si no quieres que queden mapeados a `tx` y permisos.

### 3) Listar mapping en DB: `list`

Muestra todas las combinaciones registradas:

- `npm run bo -- list`

Salida típica:

- `ObjectName.getObject tx=201`

### 4) Permisos: `perms`

Notas:

- `--dry` es DB-safe: **no** se conecta a Postgres.
- En modo `--dry`, el CLI **no** valida que `Object.method` exista en DB; solo valida el formato `Object.method` e imprime el plan.

#### Modo rápido (no interactivo)

Concede permisos:

- `npm run bo -- perms --profile 1 --allow ObjectName.getObject,ObjectName.createObject`

Revoca permisos:

- `npm run bo -- perms --profile 1 --deny ObjectName.deleteObject`

#### Modo interactivo

- `npm run bo -- perms`

Te lista `profile_id`, `object_na`, métodos disponibles y te deja elegir.

## Flujo recomendado (proyecto real)

1. Crear BO (y su estructura):
   - `npm run bo -- new Order --methods getOrder,createOrder,updateOrder,deleteOrder`
2. Implementar DB queries reales del repositorio (reemplazar los `TODO_*` en el repo).
3. Mapear métodos a DB (tx):
   - `npm run bo -- sync Order --txStart 200`
4. Asignar permisos por perfil:
   - `npm run bo -- perms --profile 2 --allow Order.getOrder,Order.createOrder`
5. Reiniciar el server para recargar cache de `Security`.

## Consideraciones importantes

- **Estabilidad de `tx`**: una vez publicado a un frontend, evita cambiar `tx_nu` (es contrato).
- **Unicidad**: idealmente `security.method.tx_nu` debería ser único (recomendado como constraint en DB).
- **Reinicio requerido**: en esta versión, permisos y tx se cargan solo al inicio.

## Troubleshooting

- Error “Missing security queries …”: revisa [src/config/queries.json](../../src/config/queries.json) (sección `security`).
- Si el CLI no conecta a DB: revisa `.env`/`DATABASE_URL` y `config.db`.
- Si el server no reconoce un tx nuevo: reinicia el server (cache de `Security`).
