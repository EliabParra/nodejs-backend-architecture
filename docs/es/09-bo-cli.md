# 09 — CLI para BO + tx + permisos (sin tocar DB manualmente)

Este repo incluye un CLI para:

- Crear la estructura estándar de un BO (carpeta + archivos base).
- Registrar automáticamente en DB el `object_na`, `method_na` y el `tx_nu` (mapping de transacciones).
- Asignar/quitar permisos a perfiles (tabla `security.permission_methods`).

El CLI vive en [scripts/bo.ts](../../scripts/bo.ts) y se ejecuta con `npm run bo`.

## Requisitos

- Tener acceso a la base de datos Postgres con el schema `security` creado.
- Variables de entorno o config DB listos (ver [docs/es/03-configuration.md](03-configuration.md)).
- Importante: `Security` cachea `tx`/permisos al iniciar. Después de cambios en DB, **reinicia el server**.

## Modelo que administra

El CLI trabaja con estas tablas (ya descritas en [docs/es/04-database-security-model.md](04-database-security-model.md)):

- `security.objects(object_id, object_name)`
- `security.methods(method_id, object_id, method_name, tx)`
- `security.profiles(profile_id)`
- `security.permission_methods(profile_id, method_id)`

Notas:

- En runtime, las queries siguen devolviendo aliases compatibles (`object_na`, `method_na`, `tx_nu`, etc.). Físicamente, las columnas se llaman `object_name`, `method_name`, `tx`.

## Comandos

Todos los comandos se ejecutan así:

- `npm run bo -- <comando> [args] [opciones]`

### 1) Crear un BO: `new`

Crea la estructura estándar de un BO con mensajes por BO.

Ejemplo (CRUD por defecto):

- `npm run bo -- new ObjectName`

Esto crea:

- `BO/ObjectName/ObjectNameBO.ts`
- `BO/ObjectName/ObjectName.ts` (entidad + `ObjectNameRepository`)
- `BO/ObjectName/ObjectNameValidate.ts`
- `BO/ObjectName/messages/objectNameSuccessMsgs.json`
- `BO/ObjectName/ObjectNameErrorHandler.ts`
- `BO/ObjectName/messages/objectNameErrorMsgs.json`
- `BO/ObjectName/messages/objectNameAlerts.json`

Ejemplo (métodos personalizados):

- `npm run bo -- new ObjectName --methods getObject,createObject,updateObject,deleteObject`

Opciones útiles:

- `--force`: sobrescribe archivos si ya existen.
- `--dry`: imprime lo que haría sin escribir archivos.

#### Crear y mapear en DB en una sola corrida (`--db`)

- `npm run bo -- new ObjectName --db`

El CLI:

1. Asegura/crea `security.objects` (`object_name = "ObjectName"`).
2. Inserta/actualiza filas en `security.methods` para cada método.
3. Asigna `tx` automáticamente desde `max(tx)+1`.

Control de tx:

- `--txStart 200` para empezar desde un número.
- `--tx 201,202,203,204` para definir el tx exacto por método (debe coincidir con la cantidad de métodos).

### 2) Sincronizar métodos del BO a DB: `sync`

Lee `BO/<Object>/<Object>BO.ts`, detecta métodos `async` y agrega los que faltan en `security.methods`.

- `npm run bo -- sync ObjectName`

Opciones:

- `--txStart <n>` o `--tx <...>` para controlar los `tx`.
- `--dry` para revisar el plan sin tocar DB.
- `--all` para sincronizar todos los BOs bajo `./BO`.
- `--prune` para borrar métodos stale en DB (existen en DB pero ya no están en el código).
- `--yes` para modo no-interactivo (desactiva prompts).

Notas:

- La detección de métodos es estricta: solo se consideran “métodos de negocio” los declarados como `async <nombre>(...)`.
- En `sync`, se ignoran los métodos que empiezan con `_` (recomendado para helpers internos como `_mapRow`, `_normalize`).
- Evita declarar helpers `async` públicos dentro del BO si no quieres que queden mapeados a `tx` y permisos.

Qué cambia realmente `sync`:

- Solo agrega métodos **faltantes** (código − DB). Los existentes mantienen su `tx` (estabilidad de contrato).
- Con `--prune`, también puede borrar métodos **stale** (DB − código). Esto siempre requiere confirmación (prompt) o `--yes`.

Ejemplos:

```bash
# Sync de un BO (solo agrega lo que falta)
npm run bo -- sync Order --txStart 200

# Sync + borrar stale (pregunta confirmación)
npm run bo -- sync Order --prune

# Sync de TODOS los BOs + prune en modo no-interactivo
npm run bo -- sync --all --prune --yes
```

Notas de dry run:

- `sync --dry` (un BO): imprime métodos detectados y el plan de tx sin conectarse a DB.
- `sync --all --dry`: no puede hacer diff contra DB sin conectar; imprime una lista solo del código.

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
    - `npm run bo -- new ObjectName --methods getObject,createObject,updateObject,deleteObject`
2. Implementar DB queries reales del repositorio (reemplazar los `TODO_*` en el repo).
3. Mapear métodos a DB (tx):
    - `npm run bo -- sync ObjectName --txStart <n>`
    - Cuando elimines métodos del código, limpia DB con: `npm run bo -- sync ObjectName --prune`
4. Asignar permisos por perfil:
    - `npm run bo -- perms --profile <profileId> --allow ObjectName.getObject,ObjectName.createObject`
5. Reiniciar el server para recargar cache de `Security`.

## Consideraciones importantes

- **Estabilidad de `tx`**: una vez publicado a un frontend, evita cambiar `tx` (es contrato).
- **Unicidad**: idealmente `security.methods.tx` debería ser único (recomendado como constraint en DB).
- **Reinicio requerido**: en esta versión, permisos y tx se cargan solo al inicio.

## Troubleshooting

- Error “Missing security queries …”: revisa [src/config/queries.json](../../src/config/queries.json) (sección `security`).
- Si el CLI no conecta a DB: revisa `.env`/`DATABASE_URL` y `config.db`.
- Si el server no reconoce un tx nuevo: reinicia el server (cache de `Security`).
