export function createFinalErrorHandler({ clientErrors, serverErrors }) {
    return function finalErrorHandler(err, req, res, next) {
        if (res.headersSent) return next(err)

        let status = err?.status ?? err?.statusCode
        if (!Number.isInteger(status) || status < 400 || status > 599) status = 500

        // Common infra errors we may emit
        if (
            typeof err?.message === 'string' &&
            err.message.startsWith('CORS origin not allowed:')
        ) {
            status = 403
        }

        let response = clientErrors.unknown
        if (status === 400) response = clientErrors.invalidParameters
        else if (status === 413) response = clientErrors.payloadTooLarge ?? clientErrors.unknown
        else if (status === 401) response = serverErrors.unauthorized
        else if (status === 403) response = serverErrors.forbidden
        else if (status === 404) response = serverErrors.notFound
        else if (status === 503) response = clientErrors.serviceUnavailable

        const rawMessage = typeof err?.message === 'string' ? err.message.trim() : ''
        const errorName =
            typeof err?.name === 'string' && err.name.trim() ? err.name.trim() : undefined
        const errorCode = err?.code != null ? String(err.code) : undefined
        const safeErrorMessage = rawMessage || errorName || errorCode || 'unknown'

        try {
            res.locals.__errorLogged = true
        } catch {}
        log.show({
            type: log.TYPE_ERROR,
            msg: `${serverErrors.serverError.msg}, unhandled: ${safeErrorMessage}`,
            ctx: {
                requestId: req.requestId,
                method: req.method,
                path: req.originalUrl,
                status,
                user_id: req.session?.user_id,
                profile_id: req.session?.profile_id,
                durationMs:
                    typeof req.requestStartMs === 'number'
                        ? Date.now() - req.requestStartMs
                        : undefined,
                errorName,
                errorCode,
            },
        })

        return res.status(status).send({
            msg: response.msg,
            code: status,
            alerts: [],
        })
    }
}
