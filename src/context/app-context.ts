export function createAppContext(): AppContext {
    // Use globalThis.* to avoid ReferenceError in ESM when a global
    // (e.g. `security`) isn't defined yet.
    const g = globalThis as unknown as {
        config?: AppConfig
        log?: AppLog
        db?: AppDb
        msgs?: any
        v?: any
        security?: AppSecurity
    }

    return {
        config: (g.config ?? config) as AppConfig,
        log: (g.log ?? log) as AppLog,
        db: (g.db ?? db) as AppDb,
        msgs: g.msgs ?? msgs,
        v: g.v ?? v,
        security: (g.security ?? security) as AppSecurity,
    }
}
