import rateLimit from 'express-rate-limit'

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
