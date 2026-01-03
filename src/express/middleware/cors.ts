import cors from 'cors'

export function applyCorsIfEnabled(app: any, deps: { config: AppConfig }) {
    const { config } = deps
    if (!(config as any)?.cors?.enabled) return

    const allowedOrigins = Array.isArray((config as any).cors.origins)
        ? (config as any).cors.origins
        : []

    app.use(
        cors({
            origin: (origin: any, callback: any) => {
                if (!origin) return callback(null, true)
                if (allowedOrigins.includes(origin)) return callback(null, true)
                return callback(new Error(`CORS origin not allowed: ${origin}`))
            },
            credentials: Boolean((config as any).cors.credentials),
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token'],
            exposedHeaders: ['X-Request-Id'],
            optionsSuccessStatus: 204,
        })
    )
}
