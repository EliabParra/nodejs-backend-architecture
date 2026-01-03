# 12 — Ejemplos incluidos

Este template ya no incluye BOs demo ni UI demo.

Sí incluye un BO **Auth** opcional bajo `BO/Auth/` (registro/verificación email/reset de password) que puedes mantener o borrar según tu proyecto.

- Si quieres servir HTML desde este backend, coloca tus archivos en `public/pages/` y usa `APP_FRONTEND_MODE=pages`.
- Si tu frontend es separado, deja `APP_FRONTEND_MODE=none` (recomendado) y consume el API desde tu repo de frontend.
