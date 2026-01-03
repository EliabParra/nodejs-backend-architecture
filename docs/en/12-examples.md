# 12 — Included examples

This template no longer ships demo BOs or a demo UI.

It does include an optional **Auth** BO under `BO/Auth/` (registration/email verification/password reset) that you can keep or remove depending on your project.

- If you want to serve HTML from this backend, put your own files under `public/pages/` and run with `APP_FRONTEND_MODE=pages`.
- If you want a separate frontend, keep `APP_FRONTEND_MODE=none` (recommended) and call the API from your frontend repo.
