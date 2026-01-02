export {}

declare global {
    // Minimal structural types used across src/BSS/**/*.ts during migration.
    // Intentionally incomplete: we only model what the codebase actually reads/writes.

    type ApiError = {
        msg: string
        code: number
        alerts?: string[]
        [k: string]: unknown
    }

    type AppSession = {
        user_id?: number
        user_na?: string
        profile_id?: number
        destroy?: () => void
        [k: string]: unknown
    }

    type AppRequest = {
        body?: unknown
        headers?: Record<string, string | string[] | undefined>
        method?: string
        originalUrl?: string
        ip?: string
        requestId?: string
        requestStartMs?: number
        session?: AppSession
        get?: (name: string) => string | undefined
        [k: string]: unknown
    }

    type AppResponse = {
        locals?: any
        status: (code: number) => AppResponse
        send: (body: any) => any
        cookie?: (name: string, value: any, options?: any) => any
        [k: string]: unknown
    }
}
