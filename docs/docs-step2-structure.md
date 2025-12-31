# Paso 2 — Nueva estructura de documentación (propuesta)

Meta: que la documentación se lea como **plantilla/framework** (lienzo en blanco) y que todo lo “demo” quede aislado en un capítulo de **Ejemplos**.

Alcance de este paso:
- Definir el **orden final** (ES y EN en paralelo).
- Definir **reglas editoriales** (tono, headings, notas/advertencias, ejemplos).
- Definir un **mapeo** desde la estructura actual hacia la nueva.

> Implementación (reescritura/movidas) queda para Pasos 3 y 4.

---

## 2.1 Estructura final (EN y ES en paralelo)

Se mantiene numeración 00–12 para consistencia y enlaces previsibles.

00 — Qué es / audiencia / principios
- Objetivo: explicar qué problema resuelve, límites, y filosofía “API-first, demo opcional”.

01 — Quickstart (mínimo para correr)
- Objetivo: correr API-only en local con DB mínima + health/ready.

02 — Arquitectura interna
- Objetivo: capas, flujo request, servicios `BSS`, por qué existe el dispatcher.

03 — Configuración
- Objetivo: env/config, overrides, CORS, sesión, frontend adapters, queries/messages.

04 — Seguridad (modelo DB + permisos)
- Objetivo: schema `security`, tx, permisos, auditoría, caching y restart.

05 — Contrato API
- Objetivo: shape de responses, endpoints base, errores, códigos.

06 — Cómo extender (crear BO, tx, permisos)
- Objetivo: guía “crear tu feature” sin depender de Person/Order.

07 — Validación y errores
- Objetivo: validación en BO + validación HTTP + errores normalizados.

08 — Frontend adapters (pages/spa/none)
- Objetivo: explicar los 3 modos como feature, sin vender demo; links a ejemplos van en 10.

09 — CLI (BO/tx/permisos)
- Objetivo: `bo`, `db-init`, permisos, sync tx, workflows.

10 — DB init CLI
- Objetivo: CLI y SQL idempotente, seed opcional, y “auto-register BOs”.

11 — Frontend clients
- Objetivo: guía para consumir el backend (cookies, CSRF, `/toProccess`) desde cualquier stack.

12 — Ejemplos (opcional)
- Objetivo: todo lo demo: BO demo (`examples/bo-demo`), demo pages (`public/pages`), tx concretos, cliente ejemplo.

---

## 2.2 Reglas editoriales (para ES y EN)

1) **Tono**
- Hablar en términos de “tu proyecto/tu dominio” (no “este repo trae X ya hecho”).
- Enfatizar defaults seguros: API-only por defecto; hosting frontend es opcional.

2) **Ejemplos**
- En docs core (00–09,11) usar placeholders:
  - `<ObjectName>`, `<methodName>`, `<tx>`, `<schema>`.
- Ejemplos concretos (`Person/Order`, `txStart 200`, links a `public/pages/index.html`, `public/js/Sender.js`) van en 10.

3) **Notas y advertencias**
- Usar siempre el mismo patrón:
  - **Note:** detalle útil
  - **Warning:** seguridad/producción (cookies, sameSite/secure, CSRF, CORS)

4) **Links**
- Preferir links a código fuente en `src/**`.
- Evitar links directos a artefactos generados `docs/api/**` como fuente de verdad.

5) **Consistencia de términos**
- Usar `tx` para el concepto; `tx_nu` solo al hablar de DB.
- “Dispatcher” = endpoint `/toProccess` + orquestación.

---

## 2.3 Mapeo (estructura actual → nueva)

La repo ya está cerca del orden objetivo; los cambios principales son:
- Reposicionar/mover contenidos “demo” a 10.
- Convertir ejemplos concretos a placeholders en 00/06/09/05.

### EN
- `docs/en/00-index.md` → mantener como 00, reemplazar ejemplos `Person/Order` por placeholders.
- `docs/en/01-getting-started.md` → mantener como 01, mover referencias específicas a `public/pages/index.html` y “demo completo” a 10.
- `docs/en/02-architecture.md` → mantener como 02, mantener mención a `examples/bo-demo/` pero como link “ver Ejemplos (10)”.
- `docs/en/03-configuration.md` → mantener como 03.
- `docs/en/04-database-security-model.md` → mantener como 04.
- `docs/en/05-api-contract.md` → mantener como 05, mover “Demo tx values” y links a `public/js/scripts.js` a 10.
- `docs/en/06-dynamic-dispatch-and-bo.md` → mantener como 06, cambiar `Order`/`txStart 200` por placeholders, ejemplo concreto a 10.
- `docs/en/07-validation-and-errors.md` → mantener como 07.
- `docs/en/08-pages-and-session.md` → **renombrar conceptualmente** a “Frontend adapters” o reescribir para que sea 08 (pages/spa/none) y mover links a HTML demo a 10.
- `docs/en/09-bo-cli.md` → mantener como 09, reemplazar `Order` por placeholders.
- `docs/en/11-frontend-clients-and-requests.md` → guía para consumir API; referencias demo van a 12.
- `docs/en/10-db-init-cli.md` → DB init CLI (slot 10).

### ES
- Mismo mapeo que EN con los archivos equivalentes en `docs/es/**`.

---

## 2.4 Checklist de ejecución (para Pasos 3 y 4)

1) Crear/reescribir `docs/*/12-examples.md` (nuevo) y mover allí:
- tx concretos del demo
- referencias a `public/pages/*.html`
- referencias a `public/js/Sender.js` / `public/js/scripts.js`
- referencias a `examples/bo-demo/**` como guía paso a paso

2) En 00/06/09 cambiar ejemplos `Person/Order` → placeholders.

3) En 08 reescribir como “Frontend adapters (pages/spa/none)” con enfoque feature-first.

4) Revisar links rotos y consistencia EN/ES.
