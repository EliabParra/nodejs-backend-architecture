import rateLimit from 'express-rate-limit'

/** @param {{ object_na?: string, method_na?: string } | null | undefined} txData */
function isAuthPublicSensitiveMethod(txData) {
    const object_na = txData?.object_na
    const method_na = txData?.method_na
    if (object_na !== 'Auth') return false
    return (
        method_na === 'register' ||
        method_na === 'requestEmailVerification' ||
        method_na === 'verifyEmail' ||
        method_na === 'requestPasswordReset' ||
        method_na === 'verifyPasswordReset' ||
        method_na === 'resetPassword'
    )
}

function safeLowerTrim(v) {
    return typeof v === 'string' ? v.trim().toLowerCase() : null
}

function getTxDataFromReq(req) {
    const tx = req?.body?.tx
    if (tx == null) return null
    try {
        return security?.getDataTx?.(tx) ?? null
    } catch {
        return null
    }
}

export function createLoginRateLimiter(clientErrors) {
    return rateLimit({
        windowMs: 60 * 1000,
        limit: 10,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) =>
            res.status(clientErrors.tooManyRequests.code).send(clientErrors.tooManyRequests),
    })
}

// Additional protection for public Auth flows routed via /toProccess.
// Only applies when tx maps to Auth.{register,requestEmailVerification,verifyEmail,requestPasswordReset,verifyPasswordReset,resetPassword}.
export function createAuthPasswordResetRateLimiter(clientErrors) {
    return rateLimit({
        windowMs: 60 * 1000,
        limit: (req) => {
            const txData = getTxDataFromReq(req)
            const method = txData?.method_na
            if (method === 'register') return 5
            if (method === 'requestEmailVerification') return 5
            if (method === 'verifyEmail') return 10
            if (method === 'requestPasswordReset') return 5
            if (method === 'verifyPasswordReset') return 10
            if (method === 'resetPassword') return 10
            return 10
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
            const txData = getTxDataFromReq(req)
            return !isAuthPublicSensitiveMethod(txData)
        },
        keyGenerator: (req) => {
            const txData = getTxDataFromReq(req)
            const method = txData?.method_na
            const ip = req.ip

            if (method === 'register') {
                const email = safeLowerTrim(req?.body?.params?.email)
                const username = safeLowerTrim(req?.body?.params?.username)
                return email && username
                    ? `auth:register:ip:${ip}:email:${email}:user:${username}`
                    : email
                      ? `auth:register:ip:${ip}:email:${email}`
                      : `auth:register:ip:${ip}`
            }

            if (method === 'requestEmailVerification') {
                const email = safeLowerTrim(req?.body?.params?.email)
                return email
                    ? `auth:emailVerify:request:ip:${ip}:email:${email}`
                    : `auth:emailVerify:request:ip:${ip}`
            }

            if (method === 'verifyEmail') {
                const token = safeLowerTrim(req?.body?.params?.token)
                const tokenKey = token ? token.slice(0, 16) : null
                return tokenKey
                    ? `auth:emailVerify:verify:ip:${ip}:token:${tokenKey}`
                    : `auth:emailVerify:verify:ip:${ip}`
            }

            if (method === 'requestPasswordReset') {
                const identifier = safeLowerTrim(req?.body?.params?.identifier)
                return identifier
                    ? `authReset:request:ip:${ip}:id:${identifier}`
                    : `authReset:request:ip:${ip}`
            }

            if (method === 'verifyPasswordReset' || method === 'resetPassword') {
                const token = safeLowerTrim(req?.body?.params?.token)
                const tokenKey = token ? token.slice(0, 16) : null
                return tokenKey
                    ? `authReset:${method}:ip:${ip}:token:${tokenKey}`
                    : `authReset:${method}:ip:${ip}`
            }

            return `authReset:ip:${ip}`
        },
        handler: (req, res) =>
            res.status(clientErrors.tooManyRequests.code).send(clientErrors.tooManyRequests),
    })
}

export function createToProccessRateLimiter(clientErrors) {
    return rateLimit({
        windowMs: 60 * 1000,
        limit: 120,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            const userId = req?.session?.user_id
            return userId ? `user:${userId}` : `ip:${req.ip}`
        },
        handler: (req, res) =>
            res.status(clientErrors.tooManyRequests.code).send(clientErrors.tooManyRequests),
    })
}
