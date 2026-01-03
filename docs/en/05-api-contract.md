# 05 — API contract (client-server)

API endpoints are defined in [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts).

## Response convention

Most responses follow this shape (not all fields are always present):

```json
{
    "code": 200,
    "msg": "...",
    "data": {},
    "alerts": []
}
```

- `code`: also used as the HTTP status.
- `msg`: UI-friendly message.
- `data`: optional payload (BO-dependent).
- `alerts`: optional validation messages (when `Validator` fails).

A typical client shows `alerts` if present; otherwise it shows `msg`.
For implementation recommendations, see [11-frontend-clients-and-requests.md](11-frontend-clients-and-requests.md).

Note: if the client sends `Content-Type: application/json` but the body is not valid JSON, the server normalizes the response to:

- `400 invalidParameters` + `alerts` (as JSON, not HTML).

Note: in general, any unhandled error is also normalized to JSON following the contract (no HTML error pages).

Final error handler implementation:

- [src/express/middleware/final-error-handler.ts](../../src/express/middleware/final-error-handler.ts)

Note: if the request body exceeds `config.app.bodyLimit`, the server may return:

- `413 payloadTooLarge`

## Correlation (requestId)

Every request gets a unique identifier and the server returns the header:

- `X-Request-Id: <uuid>`

Use it for debugging/support: when you see an error on the client, report that `requestId` and you can find the matching log entry.

## Health and readiness

These endpoints are meant for monitoring (health checks) and readiness (dependencies ready):

- `GET /health`: always returns `200` if the process is alive.
    - Example body: `{ ok: true, name, uptimeSec, time, requestId }`
- `GET /ready`: returns `200` only when the backend is ready to serve traffic.
    - Current checks:
        - `security.isReady` (security model loaded)
        - DB connectivity (`SELECT 1`)
    - If any dependency is not ready, it returns `503 serviceUnavailable`.

Implementation:

- [src/express/handlers/health.ts](../../src/express/handlers/health.ts)
- [src/express/handlers/ready.ts](../../src/express/handlers/ready.ts)

## Request logging

In addition to error logs, the server logs requests when the response finishes:

- Message: `METHOD /path STATUS` (e.g. `GET /health 200`)
- Standardized context (`ctx`):
    - `requestId`, `method`, `path`, `status`, `durationMs`
    - and when a session exists: `user_id`, `profile_id`

This helps you:

- measure latency without an APM
- correlate logs using the `X-Request-Id` header
- get basic traffic visibility in dev

Output is controlled by `config.log.activation`.

Implementation:

- requestId: [src/express/middleware/request-id.ts](../../src/express/middleware/request-id.ts)
- completion logger: [src/express/middleware/request-logger.ts](../../src/express/middleware/request-logger.ts)

Notes:

- `2xx/3xx` requests are logged as `info`.
- `4xx/5xx` requests are logged as `warning` only if they were not already logged as an error (to avoid duplicates).
- For production log aggregation, you can emit JSON logs by setting `LOG_FORMAT=json` (see [docs/en/03-configuration.md](03-configuration.md)).

## Audit (DB)

In addition to stdout logs, the backend can persist audit events to the DB when `security.audit_logs` exists:

- `login` / `logout`
- `/toProccess`: `tx_exec`, `tx_denied`, `tx_error`

These inserts are best-effort (if it fails, it won’t break the request). The `requestId` is stored as `request_id`.

Helper (best-effort): [src/BSS/helpers/audit-log.ts](../../src/BSS/helpers/audit-log.ts)

## CORS + session (frontend on another port)

If you run React/Vite/Angular on a different port (e.g. `http://localhost:5173`) and keep cookie-based sessions (as in this architecture), you need:

1. Backend: allow the origin in `config.cors.origins` and set `config.cors.credentials=true` (see [docs/en/03-configuration.md](03-configuration.md)).
2. Frontend: explicitly include cookies.

`fetch` example:

```js
fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
})
```

Same for `/toProccess`: use `credentials: 'include'`.

## CSRF (cookie-based session)

Because this backend uses a cookie-based session, `POST` requests require a CSRF token.

1. Get the token:

- `GET /csrf` → `{ "csrfToken": "..." }`

2. For every `POST`, send the header:

- `X-CSRF-Token: <csrfToken>`

If missing or invalid, the server returns:

- `403 csrfInvalid`

Note: `/toProccess` and `/logout` still return `401 login` if there is no session.

Implementation:

- [src/express/middleware/csrf.ts](../../src/express/middleware/csrf.ts)

## POST /login

Implementation: [src/BSS/Session.ts](../../src/BSS/Session.ts)

### Request

```json
{ "username": "...", "password": "..." }
```

Validation:

- `username`: `string`
- `password`: min length 8

Schema validation (shape):

- `body` must be a JSON object.
- `username` and `password` must be `string`.
- On failure: `400 invalidParameters` + `alerts`.

Reusable HTTP schema validation lives in:

- [src/BSS/helpers/http-validators.ts](../../src/BSS/helpers/http-validators.ts)

If the body is invalid JSON, it also returns `400 invalidParameters` + `alerts`.

CSRF:

- Requires `X-CSRF-Token` (see CSRF section).

### Response

- Success: `200` with `msgs[lang].success.login`
- Verification required (new device 2-step, optional): `202` with `msgs[lang].success.loginVerificationRequired`
    - Includes: `challengeToken` and `sentTo` (masked email)
- Common errors:
    - `400 invalidParameters` + `alerts`
    - `401 sessionExists`
    - `401 usernameOrPasswordIncorrect`
    - `403 emailNotVerified` (when `AUTH_REQUIRE_EMAIL_VERIFICATION=1`)
    - `409 emailRequired` (when `AUTH_REQUIRE_EMAIL_VERIFICATION=1` and the user has no email)
    - `429 tooManyRequests` (too many attempts within the time window)

Notes:

- The server can be configured to accept `username` as either an email or a username via `AUTH_LOGIN_ID`.
- The `202` flow happens only when `AUTH_LOGIN_2STEP_NEW_DEVICE=1` and the device is not yet trusted.

## POST /login/verify

Implementation: [src/BSS/Session.ts](../../src/BSS/Session.ts)

Completes the optional 2-step login challenge started by `POST /login`.

### Request

```json
{ "token": "<challengeToken>", "code": "<6-digit-code>" }
```

CSRF:

- Requires `X-CSRF-Token` (see CSRF section).

### Response

- Success: `200` with `msgs[lang].success.login`
    - Also creates the session and issues an HttpOnly device cookie to trust this browser.
- Common errors:
    - `400 invalidParameters` + `alerts`
    - `401 sessionExists`
    - `401 invalidToken` / `401 expiredToken`
    - `403 emailNotVerified` (when `AUTH_REQUIRE_EMAIL_VERIFICATION=1`)
    - `429 tooManyRequests` (too many attempts)

### Rate limiting (anti brute-force)

The `/login` endpoint is protected with rate limiting. The limiter is defined in [src/express/rate-limit/limiters.ts](../../src/express/rate-limit/limiters.ts) and applied by [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts). When the limit is exceeded it returns:

- HTTP `429`
- Body: `msgs[lang].errors.client.tooManyRequests`

## POST /logout

Implementation: [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts)

### Request

No specific body required (the demo frontend sends `{ msg: "logout" }`).

Schema validation (shape):

- If a `body` is sent, it must be a JSON object.
- On failure: `400 invalidParameters` + `alerts`.

If the body is invalid JSON, it also returns `400 invalidParameters` + `alerts`.

CSRF:

- Requires `X-CSRF-Token`.

### Response

- If session exists: `200` with `msgs[lang].success.logout`
- If no session: `401` with `msgs[lang].errors.client.login`

## POST /toProccess

Implementation: [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts)

### Request

```json
{ "tx": 123, "params": {} }
```

- `tx`: transaction number resolved to `(object_na, method_na)` from `security.methods` (see [docs/en/04-database-security-model.md](04-database-security-model.md)).
- `params`: passed directly to the BO method.

### Schema validation (shape)

Before permissions/BO execution, the server validates the request body shape:

- `body` must be a JSON object.
- `tx` must be a positive integer.
- `params` (if present) must be a `string`, `number`, `object`, or `null` (not an array).

On failure it returns:

- `400 invalidParameters`
- `alerts: []` with field-level details.

If the body is invalid JSON, it also returns `400 invalidParameters` + `alerts`.

### Rules

1. If a session exists, the request executes under `req.session.profile_id`.
2. If no session exists, the server can optionally execute as a **public profile** when `AUTH_PUBLIC_PROFILE_ID` is configured.
    - This enables anonymous flows (e.g. Auth registration/reset) while still enforcing permissions.
3. The `tx` must exist.
4. The effective `profile_id` must have permission.

CSRF:

- When authenticated: requires `X-CSRF-Token`.
- When anonymous (public profile): CSRF is not enforced (the server preserves the historical 401 behavior when there is no authenticated session).

### Response

- Session missing: `401` with `msgs[lang].errors.client.login`
- If security (tx/permissions cache) is not ready: `503 serviceUnavailable`
- Permission denied: `401` with `permissionDenied`
- Unexpected errors: server logs the details and responds with `unknown`
- If the BO returns `{ code, ... }`, the dispatcher uses that `code` as HTTP status.

### Rate limiting (load protection)

`/toProccess` is rate limited. The limiter is defined in [src/express/rate-limit/limiters.ts](../../src/express/rate-limit/limiters.ts) and applied by [src/BSS/Dispatcher.ts](../../src/BSS/Dispatcher.ts).

- Limit: 120 requests per minute.
- Key:
    - if a session exists: per `user_id`
    - otherwise: per IP
- When exceeded: HTTP `429` with `msgs[lang].errors.client.tooManyRequests`.

## tx values

The concrete `tx` values depend on your project (what exists in `security.methods.tx`).
