# Paso 1 — Auditoría de acoples en documentación (ES/EN)

Objetivo: encontrar referencias “demo” en la documentación y clasificarlas en:
- **(A) Eliminar/Reescribir**: no deben estar en el core porque amarran el template a un demo.
- **(B) Mover a “Ejemplos”**: son válidas, pero deben vivir en un capítulo/área de ejemplos (p.ej. `10 - Ejemplos`).

> Nota: esto audita **docs/** (no código). `docs/api/**` se trata como artefacto generado.

## (A) Eliminar / Reescribir (acople directo o lenguaje “demo-first”)

### A1) Referencias a “demo CRUD” en páginas integradas
- EN: `docs/en/08-pages-and-session.md`
  - “Login + demo CRUD”: [docs/en/08-pages-and-session.md](docs/en/08-pages-and-session.md#L7)
- ES: `docs/es/08-pages-and-session.md`
  - “Login + ejemplo CRUD”: [docs/es/08-pages-and-session.md](docs/es/08-pages-and-session.md#L7)

**Por qué**: el core de docs debería describir la capacidad `pages` como *modo opcional/legacy*, no como “trae un CRUD demo listo”. La referencia concreta a páginas/CRUD debería moverse a “Ejemplos” (o reescribirse como “página de ejemplo”).

### A2) Ejemplos concretos con entidades específicas (`Order`, `Person`) en guías core
- EN:
  - `docs/en/00-index.md` ejemplos con `Person`: [docs/en/00-index.md](docs/en/00-index.md#L41)
  - `docs/en/06-dynamic-dispatch-and-bo.md` ejemplos con `Order` y `--txStart 200`: [docs/en/06-dynamic-dispatch-and-bo.md](docs/en/06-dynamic-dispatch-and-bo.md#L77)
  - `docs/en/09-bo-cli-and-permissions.md` ejemplos con `Order` y `--txStart 200`: [docs/en/09-bo-cli-and-permissions.md](docs/en/09-bo-cli-and-permissions.md#L61)
- ES:
  - `docs/es/00-index.md` ejemplos con `Person`: [docs/es/00-index.md](docs/es/00-index.md#L41)
  - `docs/es/06-dynamic-dispatch-and-bo.md` ejemplos con `Order` y `--txStart 200`: [docs/es/06-dynamic-dispatch-and-bo.md](docs/es/06-dynamic-dispatch-and-bo.md#L77)
  - `docs/es/09-bo-cli-and-permissions.md` ejemplos con `Order` y `--txStart 200`: [docs/es/09-bo-cli-and-permissions.md](docs/es/09-bo-cli-and-permissions.md#L61)

**Por qué**: estos ejemplos son útiles, pero si el objetivo es “lienzo en blanco”, conviene reemplazarlos por placeholders (`<ObjectName>`, `<MethodName>`, `<txStart>`) en docs core y dejar un ejemplo concreto en “Ejemplos”.

### A3) `docs/api/**` contiene texto “demo” (artefacto generado)
- Ejemplo: `docs/api/jsdoc_types.js.html` menciona “demo frontend”: [docs/api/jsdoc_types.js.html](docs/api/jsdoc_types.js.html#L102)

**Por qué**: si `docs/api/**` está versionado, es fácil que quede desactualizado y además arrastra texto de demo. Esto se decide en la fase de estructura/reglas (Paso 2): o se regenera siempre o se excluye del repo/export.

## (B) Mover a “Ejemplos” (válido, pero debe quedar aislado)

### B1) Sección “Demo tx values” / tx específicos del demo
- EN: `docs/en/05-api-contract.md` “Demo tx values (frontend)”: [docs/en/05-api-contract.md](docs/en/05-api-contract.md#L272)
- ES: `docs/es/05-api-contract.md` “Ejemplo (frontend)” con tx del demo (ver `public/js/scripts.js`): [docs/es/05-api-contract.md](docs/es/05-api-contract.md#L272)

**Por qué**: el contrato del API debe explicar la forma `{ tx, params }`, pero los *números concretos del demo* deben vivir en “Ejemplos”.

### B2) Referencias al cliente ejemplo (`public/js/Sender.js`) y scripts del demo
- EN: `docs/en/05-api-contract.md` referencia a cliente ejemplo: [docs/en/05-api-contract.md](docs/en/05-api-contract.md#L23)
- ES: `docs/es/05-api-contract.md` referencia a cliente ejemplo: [docs/es/05-api-contract.md](docs/es/05-api-contract.md#L23)
- EN: `docs/en/10-frontend-clients-and-requests.md` referencia a cliente ejemplo: [docs/en/10-frontend-clients-and-requests.md](docs/en/10-frontend-clients-and-requests.md#L57)
- ES: `docs/es/10-frontend-clients-and-requests.md` referencia a cliente ejemplo: [docs/es/10-frontend-clients-and-requests.md](docs/es/10-frontend-clients-and-requests.md#L57)

**Por qué**: es material buenísimo de referencia, pero es “Ejemplo” (no core). En docs core basta explicar requisitos: cookies, CSRF, CORS, etc.

### B3) Modo `pages` con enlaces directos a HTML de ejemplo
- EN: `docs/en/01-getting-started.md` apunta a `public/pages/index.html`: [docs/en/01-getting-started.md](docs/en/01-getting-started.md#L119)
- ES: `docs/es/01-getting-started.md` apunta a `public/pages/index.html`: [docs/es/01-getting-started.md](docs/es/01-getting-started.md#L119)

**Por qué**: el modo `pages` como feature puede quedarse documentado, pero los links a páginas concretas de ejemplo deberían agruparse en “Ejemplos”.

### B4) “Demo completo” bajo `examples/bo-demo/` (esto está bien)
- EN: `docs/en/01-getting-started.md`: [docs/en/01-getting-started.md](docs/en/01-getting-started.md#L130)
- ES: `docs/es/01-getting-started.md`: [docs/es/01-getting-started.md](docs/es/01-getting-started.md#L130)
- EN/ES: `docs/*/02-architecture.md` menciona BOs demo bajo `examples/bo-demo/BO/`: [docs/en/02-architecture.md](docs/en/02-architecture.md#L11), [docs/es/02-architecture.md](docs/es/02-architecture.md#L11)

**Por qué**: esto refuerza el desacople (demo vive en `examples/`). Solo hay que asegurar que esté “encapsulado” en el capítulo de Ejemplos o muy claramente marcado como opcional.

## Conclusión

- El Paso 1 **estaba incompleto** para docs (lo anterior era más de código/config). Con este reporte ya queda cubierto.
- Siguiente: Paso 2 (diseñar estructura robusta) usando estas reglas:
  - Core docs = arquitectura + cómo usar/operar/extender sin depender de demo.
  - Todo lo que sea: páginas HTML de ejemplo, tx concretos del demo, cliente ejemplo, BOs concretos → “10 - Ejemplos”.
