# 12 — Ejemplos incluidos (opcional)

Este repositorio está pensado como **template**. Todo lo que sea **demo** vive aislado bajo `examples/` y/o `public/`.

Usa estos ejemplos como referencia, pero evita acoplar tu proyecto a sus entidades/nombres.

## 1) Páginas HTML (modo `pages`)

Si configuras `APP_FRONTEND_MODE=pages`, el backend sirve HTML desde `public/pages/`.

- Home/demo: [public/pages/index.html](../../public/pages/index.html)

## 2) Cliente JS (Vanilla)

- Cliente API: [public/js/Sender.js](../../public/js/Sender.js)
- Scripts de UI demo: [public/js/scripts.js](../../public/js/scripts.js)

## 3) BOs demo

- BOs de ejemplo: [examples/bo-demo/BO](../../examples/bo-demo/BO)

## 4) Demo queries (SQL registry)

Por defecto, el template no carga queries de negocio “demo”. Si quieres habilitarlas:

- Queries demo: [examples/bo-demo/config/queries.enterprise.json](../../examples/bo-demo/config/queries.enterprise.json)
- Configuración de carga: ver [docs/es/03-configuration.md](03-configuration.md)

## 5) Demo tx values

Los `tx` concretos dependen de lo que exista en tu tabla `security.method` (columna `tx_nu`).
En el demo se suelen usar valores como:

- `53`: get
- `63`: create
- `73`: update
- `83`: delete

Si esos números no existen en tu DB, el dispatcher no podrá resolverlos.
