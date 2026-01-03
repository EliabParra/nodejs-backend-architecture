export function createAppContext() {
    // Use globalThis.* to avoid ReferenceError in ESM when a global
    // (e.g. `security`) isn't defined yet.
    const g = globalThis;
    return {
        config: (g.config ?? config),
        log: (g.log ?? log),
        db: (g.db ?? db),
        queries: g.queries ?? {},
        msgs: g.msgs ?? msgs,
        v: g.v ?? v,
        security: g.security,
    };
}
