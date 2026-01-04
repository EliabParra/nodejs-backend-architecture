# 11 — Frontend clients and requests (Vanilla / React / Vite / Angular)

This backend already exposes a stable contract (see [05-api-contract.md](05-api-contract.md)) and security constraints (cookies + CSRF). This doc shows how to call it from different frontend stacks.

## 0) Decoupled backend: page modes

By default this backend is meant to be **API-only** (decoupled from any frontend). The developer chooses the mode via `APP_FRONTEND_MODE`:

- `none` (recommended): API-only. Any frontend (React/Angular/Vue/etc.) runs and deploys independently.
- `pages` (legacy): backend serves HTML from `public/pages` (course/demo mode).
- `spa` (optional): backend serves a **built SPA** (any framework) from `SPA_DIST_PATH` and falls back to `index.html`.

Variables:

- `APP_FRONTEND_MODE=none|pages|spa`
- `SPA_DIST_PATH` (spa mode): folder containing `index.html` (build output)

In development, run backend and frontend separately (backend: `npm run dev`).

## 1) What every frontend must respect

### Typical endpoints

- `GET /csrf` → returns a CSRF token bound to the current session.
- `POST /login` → starts a session.
- `POST /logout` → ends a session.
- `POST /toProccess` → single endpoint to execute operations by `tx`.

### Minimum rules

- **Session cookies**: your frontend must send cookies.
    - `fetch`: `credentials: 'include'`
    - Axios: `withCredentials: true`
    - Angular HttpClient: `{ withCredentials: true }`
- **CSRF**: for `POST` requests you must send `X-CSRF-Token`.
    - Recommended flow: call `GET /csrf` on app startup (or before the first POST) and cache the token.
- **Error contract**: on errors, the backend returns consistent JSON with fields like `code`, `msg`, `alerts`.
    - Do not assume HTML.

### `/toProccess` shape

```json
{
    "tx": 123,
    "params": { "any": "payload" }
}
```

## 2) Practical recommendation: one shared “API client”

Create a small module that:

1. Fetches and caches the CSRF token.
2. Always sends `credentials/include`.
3. Normalizes errors (always tries `res.json()` and returns `{ ok, data, error }`).

## 3) Vanilla JS/TS (fetch)

Suggested file: `apiClient.js` (in your frontend repo).

```js
let csrfToken = null

async function ensureCsrf(baseUrl) {
    if (csrfToken) return csrfToken
    const res = await fetch(`${baseUrl}/csrf`, { credentials: 'include' })
    const data = await res.json()
    csrfToken = data?.csrfToken ?? data?.token
    return csrfToken
}

export async function apiPost(baseUrl, path, body) {
    const token = await ensureCsrf(baseUrl)

    const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
        },
        body: JSON.stringify(body),
    })

    const payload = await res.json().catch(() => null)

    if (!res.ok) {
        return { ok: false, error: payload ?? { code: 'unknown', msg: 'Request failed' } }
    }

    return { ok: true, data: payload }
}

export async function toProccess(baseUrl, tx, params) {
    return apiPost(baseUrl, '/toProccess', { tx, params })
}
```

## 4) React with Vite (or standard React)

### Option A: `fetch` only (no libraries)

Create `src/api/client.ts` (plain JS also works):

```js
let csrfToken = null

export function createApiClient(baseUrl) {
    async function ensureCsrf() {
        if (csrfToken) return csrfToken
        const res = await fetch(`${baseUrl}/csrf`, { credentials: 'include' })
        const data = await res.json()
        csrfToken = data?.csrfToken ?? data?.token
        return csrfToken
    }

    async function post(path, body) {
        const token = await ensureCsrf()

        const res = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': token,
            },
            body: JSON.stringify(body),
        })

        const payload = await res.json().catch(() => null)

        if (!res.ok) {
            const err = payload ?? { code: 'unknown', msg: 'Request failed' }
            throw err
        }

        return payload
    }

    return {
        login: (identifier, password) => post('/login', { identifier, password }),
        logout: () => post('/logout', {}),
        toProccess: (tx, params) => post('/toProccess', { tx, params }),
    }
}
```

### Option B: Vite dev proxy (recommended for development)

To avoid CORS issues during development, configure a proxy in `vite.config.js`:

```js
export default {
    server: {
        proxy: {
            '/csrf': 'http://localhost:3000',
            '/login': 'http://localhost:3000',
            '/logout': 'http://localhost:3000',
            '/toProccess': 'http://localhost:3000',
        },
    },
}
```

Then your baseUrl can be empty (`''`) and you call `/toProccess` directly.

## 5) Angular

A clean Angular approach is usually:

- `ApiService` that centralizes `GET /csrf`.
- `HttpInterceptor` that appends `X-CSRF-Token` to all `POST` requests.

### ApiService (simplified)

```ts
import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'

@Injectable({ providedIn: 'root' })
export class ApiService {
    private csrfToken: string | null = null

    constructor(private http: HttpClient) {}

    async ensureCsrf(): Promise<string> {
        if (this.csrfToken) return this.csrfToken

        const data: any = await this.http.get('/csrf', { withCredentials: true }).toPromise()

        this.csrfToken = data?.csrfToken ?? data?.token
        return this.csrfToken as string
    }
}
```

## 6) Quick troubleshooting checklist

- If you get `401`: no session or no permission for that `tx`.
- If you get CSRF errors: call `GET /csrf` first and send `X-CSRF-Token`.
- If cookies are not being sent:
    - the client is missing `credentials/include` / `withCredentials`.
    - your CORS allowlist does not include the frontend origin.
- If you get `413`: request body is too large.

## 7) Production: cross-domain cookies (common failure mode)

If frontend and backend are on different domains and you want **cookie-based sessions**:

- Frontend: all session-dependent calls must use `credentials: 'include'` / `withCredentials: true`.
- Backend:
    - `cors.credentials=true`
    - `cors.origins` must include the real frontend origin (e.g. `https://myapp.example`).
- Cookie:
    - `SESSION_COOKIE_SECURE=true` (HTTPS only)
    - `SESSION_COOKIE_SAMESITE=none` (cross-site)
- If you run behind a proxy/LB terminating TLS: set `APP_TRUST_PROXY=1`.

See variables in [03-configuration.md](03-configuration.md).

## 8) How to connect “any frontend” (recommended)

### Development (no repo coupling)

1. Backend (API-only): set `APP_FRONTEND_MODE=none` in backend `.env` and run `npm run dev`.
2. Frontend: run your framework dev server (React/Vite/Angular/etc.).
3. Avoid CORS by using a dev proxy:

- Vite: `server.proxy`
- Angular: `proxy.conf.json`

### Production

- If frontend is deployed separately (recommended), configure CORS (`cors.origins`) and cookie flags (`sameSite/secure`) for your domain.
- If you want the backend to serve a SPA build, use `APP_FRONTEND_MODE=spa` and set `SPA_DIST_PATH` (folder containing `index.html`).
