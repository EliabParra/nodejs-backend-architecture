export function applyRequestLogger(app) {
    // Log completed responses with duration and requestId.
    // For status >= 400 we log only if it wasn't already logged (to avoid duplication).
    app.use((req, res, next) => {
        res.once('finish', () => {
            try {
                const status = res.statusCode

                const durationMs =
                    typeof req.requestStartMs === 'number'
                        ? Date.now() - req.requestStartMs
                        : undefined

                const ctx = {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    durationMs,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                }

                if (status >= 400) {
                    if (res?.locals?.__errorLogged) return
                    log.show({
                        type: log.TYPE_WARNING,
                        msg: `${req.method} ${req.originalUrl} ${status}`,
                        ctx,
                    })
                    return
                }

                log.show({
                    type: log.TYPE_INFO,
                    msg: `${req.method} ${req.originalUrl} ${status}`,
                    ctx,
                })
            } catch {}
        })
        next()
    })
}
