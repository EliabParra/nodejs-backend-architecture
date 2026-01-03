export function createAppContext(): AppContext {
    // Use globalThis.* to avoid ReferenceError in ESM when a global
    // (e.g. `security`) isn't defined yet.
    const g = globalThis as unknown as {
        config?: AppConfig
        log?: AppLog
        db?: AppDb
        queries?: any
        msgs?: any
        v?: any
        security?: AppSecurity
    }

    return {
        config: (g.config ?? config) as AppConfig,
        log: (g.log ?? log) as AppLog,
        db: (g.db ?? db) as AppDb,
        queries: g.queries ?? {},
        msgs: g.msgs ?? msgs,
        v: g.v ?? v,
        security: g.security,
    }
}
