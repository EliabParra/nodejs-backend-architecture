# 14 — TypeScript-first + DI (mapa de tipos)

Este repo es **TypeScript-first** (ESM, `strict: true`) y está diseñado para ser **DI-friendly** sin obligarte a usar un IoC container.

## Qué significa “DI” en este codebase

Hoy el runtime usa dos patrones complementarios:

1. **Service locator con globals** (singletons de runtime)
    - El bootstrap del runtime popula servicios en `globalThis`:
        - `config`, `queries`, `msgs`
        - `log`, `db`, `v` (validator)
        - `security` (solo en runtime del servidor)
    - Esto simplifica imports y mantiene la arquitectura actual.

2. **Seam de DI basado en contexto**
    - `createAppContext()` junta dependencias en un objeto (`AppContext`).
    - Servicios core pueden leer desde `ctx` (si existe) en vez de leer globals directo.
    - Esto deja un seam limpio para:
        - testing (inyectar `ctx` stub)
        - refactors futuros (migrar fuera de globals)

Archivos:

- `src/context/app-context.ts`: `createAppContext()`
- `src/types/globals.d.ts`: `AppContext` y tipos globales

## Tipos importantes (mapa práctico)

Estos son los tipos “de superficie” que más se usan.

### Globals de runtime

Definidos en `src/types/globals.d.ts`:

- `AppConfig`: shape tipada de `config.json` (más overrides por env).
- `AppDb`: superficie mínima de DB usada por BSS/BO (`db.exe(...)`, opcional `pool.end()`).
- `AppLog`: superficie de logging usada por el runtime.
- `AppSecurity`: superficie de tx/permisos/dispatch.
- `AppContext`: bundle de las dependencias.

### Tipos del contrato HTTP

Definidos en `src/types/http.d.ts` (tipos estructurales mínimos usados por BSS):

- `ApiError`: shape normalizada de errores.
- `AppRequest`, `AppResponse`: request/response mínimos usados por handlers.
- `AppSession`: campos de sesión usados por la app.

## Cómo usar el seam de DI

### Constructores de servicios

Recomendación: constructores que acepten `ctx: AppContext` (o lo obtengan con `createAppContext()`), para que tests puedan inyectar un stub.

Ejemplo: `Security` se crea con `new Security(createAppContext())` en el bootstrap del servidor.

### Testing

En tests puedes:

- stubear `globalThis.*` (estilo actual), o
- construir un `AppContext` “light” y pasarlo a servicios que acepten `ctx`.

## Guideline (recomendado)

- Evita leer `globalThis` profundo dentro de código de dominio.
- Prefiere pasar `ctx` a:
    - servicios BSS (DB, Security, Session)
    - handlers/métodos BO

Esto deja el repo más testeable y facilita un refactor futuro a DI puro.
