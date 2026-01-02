# 11 — Frontend clients y requests (Vanilla / React / Vite / Angular)

Este backend ya define un contrato estable (ver [05-api-contract.md](05-api-contract.md)) y medidas de seguridad (cookies + CSRF). Este documento muestra cómo consumirlo desde distintos frontends.

## 0) Backend desacoplado: modos de páginas

Por defecto, el backend está pensado para ser **API-only** (desacoplado del frontend). El desarrollador elige el modo con `APP_FRONTEND_MODE`:

- `none` (recomendado): el backend **solo sirve API**. El frontend (React/Angular/Vue/etc.) corre y se deploya donde quieras.
- `pages` (legacy): el backend sirve HTML desde `public/pages` (útil para cursos/demos o apps muy simples).
- `spa` (opcional): el backend sirve **un build SPA** (cualquier framework) desde `SPA_DIST_PATH` y hace fallback a `index.html`.

Variables:

- `APP_FRONTEND_MODE=none|pages|spa`
- `SPA_DIST_PATH` (solo `spa`): carpeta que contiene `index.html` (output de build)

Atajo opcional de desarrollo (no obligatorio): `npm run full` en el backend levanta backend + frontend leyendo `FRONTEND_PATH` desde `.env`.

## 1) Lo que todo frontend debe respetar

### Endpoints típicos

- `GET /csrf` → devuelve un token CSRF asociado a la sesión.
- `POST /login` → inicia sesión.
- `POST /logout` → cierra sesión.
- `POST /toProccess` → endpoint único para ejecutar operaciones por `tx`.

### Reglas mínimas

- **Cookies de sesión**: tu frontend debe enviar cookies.
    - En `fetch`: `credentials: 'include'`
    - En Axios: `withCredentials: true`
    - En Angular HttpClient: `{ withCredentials: true }`
- **CSRF**: para requests `POST` debes enviar `X-CSRF-Token`.
    - Flujo recomendado: pedir `GET /csrf` al iniciar la app (o antes del primer POST) y cachear el token.
- **Contrato de error**: ante error, el backend responde JSON consistente con campos como `code`, `msg`, `alerts`.
    - No asumas HTML.

### Formato de `/toProccess`

```json
{
    "tx": 123,
    "params": { "any": "payload" }
}
```

## 2) Recomendación práctica (común a todos): un “API client”

Crea un módulo que:

1. Obtenga y cachee el CSRF token.
2. Envíe siempre `credentials/include`.
3. Normalice errores (siempre intenta `res.json()` y devuelve `{ ok, data, error }`).

Si quieres ver el cliente ejemplo incluido en este repo, ver la sección **Ejemplos incluidos** al final.

Si quieres ver los ejemplos/demo incluidos en este repo, ver: [docs/es/12-examples.md](12-examples.md).

## 3) Vanilla JS (fetch)

Archivo sugerido: `public/js/apiClient.js` (o en tu frontend).

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

Uso:

```js
import { toProccess } from './apiClient.js'

const baseUrl = 'http://localhost:3000'
const result = await toProccess(baseUrl, 123, { id: 1 })

if (!result.ok) {
    console.error(result.error)
} else {
    console.log(result.data)
}
```

## 4) React con Vite (o React “normal”)

### Opción A: usar `fetch` (sin librerías)

Crea `src/api/client.js`:

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
        login: (username, password) => post('/login', { username, password }),
        logout: () => post('/logout', {}),
        toProccess: (tx, params) => post('/toProccess', { tx, params }),
    }
}
```

Ejemplo de uso en un componente:

```js
import { useMemo, useState } from 'react'
import { createApiClient } from './api/client'

export function Example() {
    const api = useMemo(() => createApiClient('http://localhost:3000'), [])
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)

    async function run() {
        setError(null)
        try {
            const data = await api.toProccess(123, { id: 1 })
            setResult(data)
        } catch (e) {
            setError(e)
        }
    }

    return (
        <div>
            <button onClick={run}>Run tx</button>
            {error && <pre>{JSON.stringify(error, null, 2)}</pre>}
            {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
        </div>
    )
}
```

### Opción B: Vite proxy (recomendado en desarrollo)

Para evitar problemas CORS en desarrollo, usa un proxy en `vite.config.js`:

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

Luego tu baseUrl puede ser vacío (`''`) y llamas directamente a `/toProccess`.

## 5) Angular

En Angular, la forma más limpia suele ser:

- Un `ApiService` que centraliza `GET /csrf`.
- Un `HttpInterceptor` que agrega `X-CSRF-Token` a todos los `POST`.

### ApiService (simplificado)

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

### Interceptor (idea)

- Solo agrega `X-CSRF-Token` en `POST`.
- Siempre usa `withCredentials: true`.

Nota: el detalle exacto del interceptor depende de tu versión de Angular/RxJS, pero el patrón es el mismo.

## 6) Checklist rápido para “cuando no funciona”

- Si ves `401`: no hay sesión o no hay permiso para el `tx`.
- Si ves error CSRF: primero llama a `GET /csrf` y asegúrate de mandar `X-CSRF-Token`.
- Si las cookies no viajan:
    - tu cliente no está usando `credentials/include` / `withCredentials`.
    - tu CORS allowlist no incluye el origen del frontend.

## 7) Producción: cookies cross-domain (lo típico que falla)

Si el frontend y backend están en dominios distintos y quieres **sesión por cookie**:

- Frontend: todas las llamadas que dependan de sesión deben usar `credentials: 'include'` / `withCredentials: true`.
- Backend:
    - `cors.credentials=true`
    - `cors.origins` debe contener el origen real del frontend (ej. `https://miapp.com`).
- Cookie:
    - `SESSION_COOKIE_SECURE=true` (solo HTTPS)
    - `SESSION_COOKIE_SAMESITE=none` (cross-site)
- Si hay proxy/LB terminando TLS: configura `APP_TRUST_PROXY=1`.

Ver variables en [03-configuration.md](03-configuration.md).

- Si recibes `413`: estás enviando un body demasiado grande.

## 7) Cómo conectar “cualquier frontend” (recomendado)

### Desarrollo (sin acoplar repos)

1. Backend (API-only): en `.env` del backend usa `APP_FRONTEND_MODE=none` y corre `npm run dev`.
2. Frontend: usa el dev server de tu framework (React/Vite/Angular/etc.).
3. Evita CORS con proxy:
    - Vite: `server.proxy`
    - Angular: `proxy.conf.json`

### Producción

- Si el frontend se deploya separado (recomendado), configura CORS (`cors.origins`) y cookies (`sameSite/secure`) según tu dominio.
- Si quieres que el backend sirva una SPA, usa `APP_FRONTEND_MODE=spa` y define `SPA_DIST_PATH` (carpeta con `index.html`).

## 8) (Opcional) `npm run full` para DX

`npm run full` es solo un helper de dev. Requiere en `.env` del backend:

- `FRONTEND_PATH=RUTA_AL_REPO_FRONT` (debe contener `package.json`)
- `FRONTEND_SCRIPT=start` (opcional)
- `FRONTEND_ARGS=...` (opcional)
    - Ejemplo (Angular): `FRONTEND_ARGS=--port 4201`
- `BACKEND_SCRIPT=dev` (opcional)
- `BACKEND_ARGS=...` (opcional)
- `FULL_KEEP_ALIVE=true` (opcional)
