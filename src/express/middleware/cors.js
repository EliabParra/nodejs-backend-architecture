import cors from 'cors'

export function applyCorsIfEnabled(app) {
    if (!config?.cors?.enabled) return

    const allowedOrigins = Array.isArray(config.cors.origins) ? config.cors.origins : []

    app.use(
        cors({
            origin: (origin, callback) => {
                if (!origin) return callback(null, true)
                if (allowedOrigins.includes(origin)) return callback(null, true)
                return callback(new Error(`CORS origin not allowed: ${origin}`))
            },
            credentials: Boolean(config.cors.credentials),
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token'],
            exposedHeaders: ['X-Request-Id'],
            optionsSuccessStatus: 204,
        })
    )
}
