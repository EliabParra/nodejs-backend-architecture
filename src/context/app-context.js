export function createAppContext() {
    return {
        config: globalThis.config,
        log: globalThis.log,
        db: globalThis.db,
        msgs: globalThis.msgs,
        v: globalThis.v,
        security: globalThis.security,
    }
}
