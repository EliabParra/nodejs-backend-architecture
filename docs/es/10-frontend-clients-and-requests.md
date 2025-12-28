# Tutorial Frontend (Vanilla / React / Vite / Angular)

Este backend ya define un contrato estable (ver [05-api-contract.md](05-api-contract.md)) y medidas de seguridad (cookies + CSRF). Este documento muestra cómo consumirlo desde distintos frontends.

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

1) Obtenga y cachee el CSRF token.
2) Envíe siempre `credentials/include`.
3) Normalice errores (siempre intenta `res.json()` y devuelve `{ ok, data, error }`).

Puedes tomar como referencia el cliente ejemplo ya incluido: [public/js/Sender.js](../../public/js/Sender.js).

## 3) Vanilla JS (fetch)

Archivo sugerido: `public/js/apiClient.js` (o en tu frontend).

```js
let csrfToken = null;

async function ensureCsrf(baseUrl) {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${baseUrl}/csrf`, { credentials: 'include' });
  const data = await res.json();
  csrfToken = data?.token;
  return csrfToken;
}

export async function apiPost(baseUrl, path, body) {
  const token = await ensureCsrf(baseUrl);

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    return { ok: false, error: payload ?? { code: 'unknown', msg: 'Request failed' } };
  }

  return { ok: true, data: payload };
}

export async function toProccess(baseUrl, tx, params) {
  return apiPost(baseUrl, '/toProccess', { tx, params });
}
```

Uso:

```js
import { toProccess } from './apiClient.js';

const baseUrl = 'http://localhost:3000';
const result = await toProccess(baseUrl, 101, { person_id: 1 });

if (!result.ok) {
  console.error(result.error);
} else {
  console.log(result.data);
}
```

## 4) React con Vite (o React “normal”)

### Opción A: usar `fetch` (sin librerías)

Crea `src/api/client.js`:

```js
let csrfToken = null;

export function createApiClient(baseUrl) {
  async function ensureCsrf() {
    if (csrfToken) return csrfToken;
    const res = await fetch(`${baseUrl}/csrf`, { credentials: 'include' });
    const data = await res.json();
    csrfToken = data?.token;
    return csrfToken;
  }

  async function post(path, body) {
    const token = await ensureCsrf();

    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      const err = payload ?? { code: 'unknown', msg: 'Request failed' };
      throw err;
    }

    return payload;
  }

  return {
    login: (user, pass) => post('/login', { user, pass }),
    logout: () => post('/logout', {}),
    toProccess: (tx, params) => post('/toProccess', { tx, params }),
  };
}
```

Ejemplo de uso en un componente:

```js
import { useMemo, useState } from 'react';
import { createApiClient } from './api/client';

export function Example() {
  const api = useMemo(() => createApiClient('http://localhost:3000'), []);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setError(null);
    try {
      const data = await api.toProccess(101, { person_id: 1 });
      setResult(data);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <button onClick={run}>Run tx</button>
      {error && <pre>{JSON.stringify(error, null, 2)}</pre>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
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
};
```

Luego tu baseUrl puede ser vacío (`''`) y llamas directamente a `/toProccess`.

## 5) Angular

En Angular, la forma más limpia suele ser:

- Un `ApiService` que centraliza `GET /csrf`.
- Un `HttpInterceptor` que agrega `X-CSRF-Token` a todos los `POST`.

### ApiService (simplificado)

```ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private csrfToken: string | null = null;

  constructor(private http: HttpClient) {}

  async ensureCsrf(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;

    const data: any = await this.http
      .get('/csrf', { withCredentials: true })
      .toPromise();

    this.csrfToken = data?.token;
    return this.csrfToken as string;
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
- Si recibes `413`: estás enviando un body demasiado grande.
