# Step 1 — Audit (demo coupling & hardcoded identifiers)

Scope: identify remaining references that make the backend template feel “demo-tied” (e.g. `enterprise` schema, `Person`/`Order`), and hardcoded repo/app identifiers.

## Findings (actionable)

### 1) Demo SQL/queries live in runtime config
- **Where**: `src/config/queries.json`
- **What**: contains an `enterprise` section with demo queries (`getPerson`, `createPerson`, etc.) hardcoded to schema `enterprise`.
- **Why it matters**: this file is loaded by the real app; keeping demo schema+queries here makes the template feel coupled to the sample domain.
- **Suggested fix (Step 2+)**: move `enterprise` into `examples/bo-demo/` and load/merge it only when the demo is enabled.

### 2) Script example references a specific frontend repo name
- **Where**: `scripts/full.mjs`
- **What**: usage example includes `FRONTEND_PATH=..\\frontend-angular-repo`.
- **Why it matters**: ties the backend template to a specific workspace/repo naming.
- **Suggested fix (Step 2+)**: make the example generic (e.g. `..\\frontend`), or say “path to your frontend repo”.

## Findings (expected / OK)

### 3) Demo BO names in docs (as examples)
- **Where**: `docs/en/*`, `docs/es/*` (notably `00-index.md`, `06-dynamic-dispatch-and-bo.md`, `09-bo-cli-and-permissions.md`)
- **What**: mentions `Person`, `Order`, and method examples like `getPerson`.
- **Assessment**: OK if phrased as *examples* (not requirements) and/or explicitly pointing to `examples/bo-demo/`.

### 4) Demo BO code under examples
- **Where**: `examples/bo-demo/BO/**`
- **What**: `Person`, `Order`, `Facturacion` demo BOs and messages.
- **Assessment**: expected and desirable (keeps template core clean).

### 5) `docs/api/**` generated JSDoc artifacts
- **What**: can contain strings like the repo name and routes.
- **Assessment**: treat as generated output; if it’s committed, it may become stale vs current code.

## Next (Steps 2–4)

Priority order for cleanup:
1) Extract demo queries from `src/config/queries.json` into `examples/bo-demo/` (and optionally add a small “merge extra queries” mechanism driven by env/config).
2) Make `scripts/full.mjs` examples generic.
3) Re-run tests (`npm test`) and (if applicable) regenerate docs (`npm run docs:jsdoc`) to ensure artifacts match.
