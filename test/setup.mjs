// Shared test bootstrap.
// Loaded via `node --import` so tests stay framework-free and consistent.

process.env.NODE_ENV ??= 'test'
process.env.TZ ??= 'UTC'
