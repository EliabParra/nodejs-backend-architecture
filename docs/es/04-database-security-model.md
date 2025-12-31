# 04 — Modelo de seguridad (schema `security`)

Tu arquitectura usa un **modelo transaccional**: el cliente envía un `tx`, el servidor lo traduce a `(object_na, method_na)` consultando el schema `security`, verifica permisos y recién ahí ejecuta el BO.

## Queries que definen el modelo

Todas las queries de seguridad están en [src/config/queries.json](../../src/config/queries.json) bajo `security`.

- `security.getUser`: login por `(user_na, user_pw)` → devuelve `user_id`, `user_na`, `profile_id`
- `security.getUser`: obtiene el usuario por `user_na` y retorna `user_pw` (hash) para validar password vía bcrypt en servidor
- `security.loadPermissions`: carga permisos de cada perfil por `(object_na, method_na)`
- `security.loadDataTx`: carga mapping `tx_nu` → `(object_na, method_na)`

Estas cargas se hacen al iniciar el proceso en [src/BSS/Security.js](../../src/BSS/Security.js).

## Tablas esperadas (inferidas por las queries)

Las queries actuales implican estas tablas y campos mínimos:

- `security.user`:
  - `user_id` (PK)
  - `user_na` (username)
  - `user_pw` (**hash bcrypt**)

- `security.profile`:
  - `profile_id` (PK)

- `security.user_profile`:
  - `user_id` (FK → user)
  - `profile_id` (FK → profile)

- `security.object`:
  - `object_id` (PK)
  - `object_na` (nombre lógico del BO, ej. `Person`)

- `security.method`:
  - `method_id` (PK)
  - `object_id` (FK → object)
  - `method_na` (nombre de método, ej. `getPerson`)
  - `tx_nu` (número de transacción que envía el cliente)

- `security.permission_method`:
  - `profile_id` (FK → profile)
  - `method_id` (FK → method)

## Campos y tablas opcionales (recomendados)

Para uso real (no solo demo), es común agregar:

- `security."user"`:
  - `is_active` (deshabilitar cuentas sin borrar)
  - `created_at`, `updated_at`
  - `last_login_at`
  - `user_em` (email) opcional
- `security.profile.profile_na` (nombre humano del perfil)
- `security.audit_log` (auditoría de login/logout/tx)

El CLI `npm run db:init` crea estas extensiones de forma idempotente.

## Cómo se usa en runtime

1. En startup, `Security.loadDataTx()` arma `txMap: Map<tx_nu, {object_na, method_na}>`.
2. En startup, `Security.loadPermissions()` arma `permission: Map<"profile_id_method_na_object_na", true>`.
3. En cada request a `/toProccess`:
   - se resuelve `txMap.get(tx)`
   - se verifica `permission.get("<profile>_<method>_<object>")`

## Guía: registrar una nueva transacción (tx)

Cuando agregas una feature nueva, estos son los pasos **mínimos** para que el dispatcher pueda ejecutarla:

1. **Crear/registrar el object**
   - Insert en `security.object` con `object_na = "<TuObjeto>"`

2. **Crear/registrar el method**
   - Insert en `security.method` con:
     - `object_id` del object
     - `method_na = "<tuMetodo>"`
     - `tx_nu = <numeroTx>` (este número lo enviará el cliente)

3. **Asignar permisos**
   - Insert en `security.permission_method` un registro por perfil autorizado (`profile_id`, `method_id`).

4. **Asignar perfil al usuario** (si hace falta)
   - Asegúrate de que `security.user_profile` conecte el user con el profile.

## Reglas de consistencia (críticas)

- `object_na` debe coincidir exactamente con:
  - carpeta `BO/<object_na>/`
  - archivo `BO/<object_na>/<object_na>BO.js`
  - nombre exportado de clase `export class <object_na>BO { ... }`
  (ver [docs/es/06-dynamic-dispatch-and-bo.md](06-dynamic-dispatch-and-bo.md))

- `method_na` debe existir como método en la clase BO (ej. `getPerson(params)` en [BO/Person/PersonBO.js](../../BO/Person/PersonBO.js)).

## Nota operativa

Los permisos y el tx-map se cargan **una vez al inicio** (caché en memoria). Si cambias `security.method` o permisos en DB, en esta versión necesitas reiniciar el servidor para recargar.

## Login (detalle)

Implementación: [src/BSS/Session.js](../../src/BSS/Session.js)

- La query `security.getUser` ya no valida password en SQL.
- El servidor compara `password` vs `user.user_pw` usando bcrypt.

Ventaja: nunca envías ni guardas passwords en texto plano; reduces el riesgo ante filtraciones de DB.
