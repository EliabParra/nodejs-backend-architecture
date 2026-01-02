export {}

declare global {
    // Populated by src/globals.js at process startup
    const config: any
    const log: any
    const db: any
    const msgs: any
    const v: any
    const security: any
    const require: any

    interface GlobalThis {
        security: any
    }
}
