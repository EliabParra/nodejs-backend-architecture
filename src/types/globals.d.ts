export {}

declare global {
    type AppConfig = {
        app?: {
            lang?: string
            host?: string
            port?: number
            name?: string
            trustProxy?: any
            frontendMode?: string
            [k: string]: unknown
        }
        bo?: {
            path?: string
            [k: string]: unknown
        }
        auth?: {
            [k: string]: unknown
        }
        session?: {
            cookie?: {
                sameSite?: any
                secure?: any
                maxAge?: number
                [k: string]: unknown
            }
            [k: string]: unknown
        }
        [k: string]: unknown
    }

    type AppLog = {
        TYPE_ERROR: any
        TYPE_INFO: any
        show: (event: any) => any
        [k: string]: unknown
    }

    type AppDb = {
        exe: (schema: string, query: string, params: any) => Promise<any>
        pool?: {
            end?: () => Promise<any>
            [k: string]: unknown
        }
        [k: string]: unknown
    }

    type AppSecurity = {
        isReady: boolean
        ready: Promise<any>
        initError?: unknown
        getPermissions: (data: any) => boolean
        getDataTx: (tx: any) => any
        executeMethod: (data: any) => Promise<any>
        [k: string]: unknown
    }

    // Populated by src/globals.js at process startup
    const config: AppConfig
    const log: AppLog
    const db: AppDb
    const queries: any
    const msgs: any
    const v: any
    const security: AppSecurity
    const require: any

    interface GlobalThis {
        require: any
        config: AppConfig
        log: AppLog
        db: AppDb
        queries: any
        msgs: any
        v: any
        security: AppSecurity
    }

    type AppContext = {
        config: AppConfig
        log: AppLog
        db: AppDb
        msgs: any
        v: any
        security: AppSecurity
    }
}
