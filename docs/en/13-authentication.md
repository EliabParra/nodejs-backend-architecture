# 13 — Authentication (Auth module)

This repo includes an **optional Auth module** implemented as a BO (`BO/Auth/AuthBO.ts`) plus a couple of HTTP endpoints (`/login`, `/login/verify`).

It supports:

- Registration + email verification (public, via `POST /toProccess`)
- Password reset (public, via `POST /toProccess`)
- Login via `POST /login`
- Optional **2-step login only for new devices** via `POST /login/verify`
- Optional **"email must be verified before login"**

> Important: public Auth flows are still protected by the `tx` + permissions model.
> You enable anonymous execution by configuring a **public profile id** and granting only the required Auth permissions.

## 1) Setup (DB + tx + permissions)

### A) Initialize the security schema

Run the DB init CLI:

```bash
npm run db:init
```

See [10-db-init-cli.md](10-db-init-cli.md).

### B) Enable Auth support tables

Auth uses extra tables/columns for one-time codes and (optionally) device trust + login challenges.

Use either:

- CLI flags: `npm run db:init -- --auth`
- Or env: `AUTH_ENABLE=1 npm run db:init`

### C) Seed minimal profiles + public Auth permissions (recommended)

If you want to expose Auth public flows via `/toProccess` (register/email verification/password reset), you typically want:

- A **session profile** (authenticated users), often `profile_id=1`
- A **public profile** (anonymous users), often `profile_id=2`

Then grant the public profile permissions only for the intended Auth methods.

The DB init CLI can do this:

```bash
npm run db:init -- --seedProfiles --seedPublicAuthPerms
```

This will:

- Ensure profiles exist (`public` + `session`)
- When BOs are registered, grant public permissions for:
    - `Auth.register`
    - `Auth.requestEmailVerification`
    - `Auth.verifyEmail`
    - `Auth.requestPasswordReset`
    - `Auth.verifyPasswordReset`
    - `Auth.resetPassword`

Finally, set at runtime:

- `AUTH_PUBLIC_PROFILE_ID=<publicProfileId>`

So `/toProccess` can run those methods without an authenticated session.

## 2) Config (runtime)

Config lives in [src/config/config.json](../../src/config/config.json) and env overrides in [src/globals.ts](../../src/globals.ts).

Common Auth settings:

- `AUTH_LOGIN_ID=email|username`
- `AUTH_LOGIN_2STEP_NEW_DEVICE=1|0`
- `AUTH_PUBLIC_PROFILE_ID=<id>` (enables anonymous `/toProccess` using that profile)
- `AUTH_REQUIRE_EMAIL_VERIFICATION=1|0`

Email settings (for challenge / reset / verification):

- `EMAIL_MODE=log|smtp`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM`

> When `EMAIL_MODE=log`, tokens/codes are **not** logged by default unless `config.email.logIncludeSecrets=true` (or `NODE_ENV=test`).

## 3) Flows (how to use)

### A) Registration + email verification (public via `/toProccess`)

1. Register (creates user + assigns profile + sends verification email):

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_for_Auth.register>, "params": { "username": "john_doe", "email": "john@example.com", "password": "..." } }
```

2. Verify email using the token+code received by email:

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_for_Auth.verifyEmail>, "params": { "token": "...", "code": "..." } }
```

3. After verification, login is allowed (if `AUTH_REQUIRE_EMAIL_VERIFICATION=1`).

Notes:

- `requestEmailVerification` exists to re-send/regenerate a verification code.
- These methods are rate-limited and do not leak whether an email exists (anti-enumeration).

### B) Login (`POST /login`)

Request:

```json
{ "username": "<email_or_username>", "password": "..." }
```

Response:

- `200`: session created
- `202`: verification required (only when `AUTH_LOGIN_2STEP_NEW_DEVICE=1` and device is not trusted)
    - Includes `challengeToken` and a masked `sentTo` value
- `403 emailNotVerified`: when `AUTH_REQUIRE_EMAIL_VERIFICATION=1` and user is not verified

### C) New device 2-step (`POST /login/verify`)

If `/login` returns `202`, complete login with:

```http
POST /login/verify
Content-Type: application/json

{ "token": "<challengeToken>", "code": "<6-digit-code>" }
```

On success:

- Returns `200`
- Creates the session
- Issues an `HttpOnly` device cookie (default name `device_token`) to trust this browser.

### D) Password reset (public via `/toProccess`)

1. Request reset (sends email token+code):

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_for_Auth.requestPasswordReset>, "params": { "email": "john@example.com" } }
```

2. Verify reset code/token:

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_for_Auth.verifyPasswordReset>, "params": { "token": "...", "code": "..." } }
```

3. Reset password:

```http
POST /toProccess
Content-Type: application/json

{ "tx": <tx_for_Auth.resetPassword>, "params": { "token": "...", "code": "...", "newPassword": "..." } }
```

Security notes:

- Reset codes have attempt limits and expiration.
- After a successful password reset, existing sessions are invalidated.

## 4) Finding the Auth tx numbers

Tx numbers are **project-specific** (they live in Postgres under `security.method.tx_nu`).

Ways to find them:

- Use the BO CLI to list registered methods/tx (see [09-bo-cli.md](09-bo-cli.md))
- Or query directly:

```sql
select o.object_na, m.method_na, m.tx_nu
from security.method m
join security.object o on o.object_id = m.object_id
where o.object_na = 'Auth'
order by m.tx_nu;
```

## 5) Related docs

- API shape, CSRF, and `/toProccess`: [05-api-contract.md](05-api-contract.md)
- DB init options: [10-db-init-cli.md](10-db-init-cli.md)
- Permissions model: [04-database-security-model.md](04-database-security-model.md)
