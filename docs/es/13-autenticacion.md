# 13 — Autenticación (módulo Auth)

Este repo incluye un **módulo Auth opcional** implementado como BO (`BO/Auth/AuthBO.js`) más algunos endpoints HTTP (`/login`, `/login/verify`).

Soporta:

- Registro + verificación de email (público, vía `POST /toProccess`)
- Restablecer contraseña (público, vía `POST /toProccess`)
- Login vía `POST /login`
- Opcional: **login en 2 pasos solo en dispositivo nuevo** vía `POST /login/verify`
- Opcional: **"debe verificar email antes de iniciar sesión"**

> Importante: los flujos públicos de Auth siguen protegidos por el modelo `tx` + permisos.
> La ejecución anónima se habilita configurando un **profile id público** y otorgando permisos mínimos.

## 1) Setup (DB + tx + permisos)

### A) Inicializa el schema `security`

Ejecuta DB init:

```bash
npm run db:init
```

Ver [10-db-init-cli.md](10-db-init-cli.md).

### B) Habilita tablas de soporte de Auth

Auth usa tablas/columnas extra para códigos de un solo uso y (opcionalmente) confianza por dispositivo + desafíos de login.

Puedes usar:

- Flags: `npm run db:init -- --auth`
- O env: `AUTH_ENABLE=1 npm run db:init`

### C) Seed de perfiles mínimos + permisos públicos de Auth (recomendado)

Si quieres exponer flujos públicos de Auth por `/toProccess` (registro/verificación/reset), normalmente quieres:

- Un **perfil de sesión** (usuarios autenticados), típicamente `profile_id=1`
- Un **perfil público** (anónimo), típicamente `profile_id=2`

Luego otorgas permisos al perfil público solo para los métodos públicos de Auth.

DB init puede hacerlo:

```bash
npm run db:init -- --seedProfiles --seedPublicAuthPerms
```

Esto:

- Asegura que existan perfiles mínimos (`public` + `session`)
- Al registrar BOs, otorga permisos públicos para:
    - `Auth.register`
    - `Auth.requestEmailVerification`
    - `Auth.verifyEmail`
    - `Auth.requestPasswordReset`
    - `Auth.verifyPasswordReset`
    - `Auth.resetPassword`

Finalmente en runtime define:

- `AUTH_PUBLIC_PROFILE_ID=<publicProfileId>`

Así `/toProccess` puede ejecutar esos métodos sin sesión autenticada.

## 2) Config (runtime)

La config está en [src/config/config.json](../../src/config/config.json) y los overrides por env en [src/globals.js](../../src/globals.js).

Opciones comunes:

- `AUTH_LOGIN_ID=email|username`
- `AUTH_LOGIN_2STEP_NEW_DEVICE=1|0`
- `AUTH_PUBLIC_PROFILE_ID=<id>` (habilita `/toProccess` anónimo usando ese perfil)
- `AUTH_REQUIRE_EMAIL_VERIFICATION=1|0`

Email (para desafío/reset/verificación):

- `EMAIL_MODE=log|smtp`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM`

> En `EMAIL_MODE=log`, por defecto NO se loguean tokens/códigos salvo que `config.email.logIncludeSecrets=true` (o `NODE_ENV=test`).

## 3) Flujos (cómo se usa)

### A) Registro + verificación de email (público vía `/toProccess`)

1. Registrar (crea usuario + asigna perfil + envía email):

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_de_Auth.register>, "params": { "username": "john_doe", "email": "john@example.com", "password": "..." } }
```

2. Verificar email con token+código recibido por email:

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_de_Auth.verifyEmail>, "params": { "token": "...", "code": "..." } }
```

3. Luego el login queda permitido (si `AUTH_REQUIRE_EMAIL_VERIFICATION=1`).

Notas:

- `requestEmailVerification` existe para reenviar/regenerar código.
- Estos métodos tienen rate limiting y evitan filtrar si el email existe (anti-enumeración).

### B) Login (`POST /login`)

Request:

```json
{ "username": "<email_o_usuario>", "password": "..." }
```

Response:

- `200`: sesión creada
- `202`: verificación requerida (solo cuando `AUTH_LOGIN_2STEP_NEW_DEVICE=1` y el dispositivo no es de confianza)
    - Incluye `challengeToken` y `sentTo` (enmascarado)
- `403 emailNotVerified`: cuando `AUTH_REQUIRE_EMAIL_VERIFICATION=1` y el usuario no está verificado

### C) Dispositivo nuevo: 2 pasos (`POST /login/verify`)

Si `/login` devolvió `202`, completa el login con:

```http
POST /login/verify
Content-Type: application/json

{ "token": "<challengeToken>", "code": "<código-6-dígitos>" }
```

En éxito:

- Responde `200`
- Crea la sesión
- Emite una cookie `HttpOnly` de dispositivo (por defecto `device_token`) para confiar este browser.

### D) Password reset (público vía `/toProccess`)

1. Solicitar reset (envía email con token+código):

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_de_Auth.requestPasswordReset>, "params": { "email": "john@example.com" } }
```

2. Verificar código/token:

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_de_Auth.verifyPasswordReset>, "params": { "token": "...", "code": "..." } }
```

3. Resetear contraseña:

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_de_Auth.resetPassword>, "params": { "token": "...", "code": "...", "newPassword": "..." } }
```

Notas de seguridad:

- Los códigos tienen expiración y límite de intentos.
- Tras un reset exitoso se invalidan sesiones existentes.

## 4) Cómo obtener los tx de Auth

Los tx son **específicos de tu proyecto** (viven en Postgres en `security.method.tx_nu`).

Formas de encontrarlos:

- Usa el BO CLI para listar métodos/tx (ver [09-bo-cli.md](09-bo-cli.md))
- O consulta directo:

```sql
select o.object_na, m.method_na, m.tx_nu
from security.method m
join security.object o on o.object_id = m.object_id
where o.object_na = 'Auth'
order by m.tx_nu;
```

## 5) Docs relacionadas

- Shape API, CSRF y `/toProccess`: [05-api-contract.md](05-api-contract.md)
- Opciones de DB init: [10-db-init-cli.md](10-db-init-cli.md)
- Modelo de permisos: [04-database-security-model.md](04-database-security-model.md)
