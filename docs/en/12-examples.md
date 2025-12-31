# 12 — Included examples (optional)

This repository is meant to be a **template**. Anything that is **demo/reference** is intentionally isolated under `examples/` and/or `public/`.

Use these examples as reference, but avoid coupling your own project to their entities/names.

## 1) HTML pages (pages mode)

When `APP_FRONTEND_MODE=pages`, the backend serves static HTML from `public/pages/`.

- Demo home: [public/pages/index.html](../../public/pages/index.html)

## 2) Vanilla JS client

- API client: [public/js/Sender.js](../../public/js/Sender.js)
- Demo UI scripts: [public/js/scripts.js](../../public/js/scripts.js)

## 3) Demo BOs

- Demo BOs: [examples/bo-demo/BO](../../examples/bo-demo/BO)

## 4) Demo queries (SQL registry)

By default, the template does not load demo business queries. To enable them:

- Demo queries: [examples/bo-demo/config/queries.enterprise.json](../../examples/bo-demo/config/queries.enterprise.json)
- Loading configuration: see [docs/en/03-configuration.md](03-configuration.md)

## 5) Demo tx values

The concrete `tx` values depend on what exists in your `security.method` table (`tx_nu`).
In the demo UI it’s common to use values like:

- `53`: get
- `63`: create
- `73`: update
- `83`: delete

If those numbers do not exist in your DB, the dispatcher cannot resolve them.
