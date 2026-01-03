# 14 — TypeScript-first + DI (types overview)

This repo is **TypeScript-first** (ESM, `strict: true`) and is designed to be **DI-friendly** without requiring a full IoC container.

## What “DI” means in this codebase

Today the runtime uses two complementary patterns:

1. **Global service locator** (runtime singletons)
    - Runtime bootstrap populates services in `globalThis`:
        - `config`, `queries`, `msgs`
        - `log`, `db`, `v` (validator)
        - `security` (server runtime only)
    - This keeps imports simple and supports the current architecture.

2. **Context-based dependency injection seam**
    - `createAppContext()` collects the dependencies into one object (`AppContext`).
    - Core services can read from `ctx` (when available) instead of reading globals directly.
    - This gives you a clean seam for:
        - testing (stubbing `ctx`)
        - future refactors (moving away from global reads)

Files:

- `src/context/app-context.ts`: `createAppContext()`
- `src/types/globals.d.ts`: `AppContext` and global types

## The important types (practical map)

These are the “surface” types most developers touch.

### Runtime globals

Defined in `src/types/globals.d.ts`:

- `AppConfig`: typed `config.json` shape (plus env overrides).
- `AppDb`: minimal DB surface used by BSS/BO (`db.exe(...)`, optional `pool.end()`).
- `AppLog`: log surface used by runtime.
- `AppSecurity`: tx/permissions/dispatch surface.
- `AppContext`: a bundle of the above.

### HTTP contract types

Defined in `src/types/http.d.ts` (minimal structural types used by BSS):

- `ApiError`: normalized error payload shape.
- `AppRequest`, `AppResponse`: minimal request/response structural types used by handlers.
- `AppSession`: session fields used by the app.

## How to use the DI seam

### Service constructors

Prefer constructors that accept `ctx: AppContext` (or read it from `createAppContext()`), so tests can inject a stub.

Example: `Security` is created with `new Security(createAppContext())` at server bootstrap.

### Testing

In tests you can:

- stub `globalThis.*` (current test style), or
- build a lightweight `AppContext` stub and pass it into services that accept `ctx`.

## Design guideline (recommended)

- Avoid reading `globalThis` deep inside domain code.
- Prefer passing `ctx` into:
    - BSS services (DB, Security, Session)
    - BO method handlers

This keeps the architecture testable and makes future refactors (pure DI, no globals) straightforward.
