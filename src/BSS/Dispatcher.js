import Session from "./Session.js"
import express from "express"
import rateLimit from "express-rate-limit"
import { randomUUID, randomBytes } from "node:crypto"
import cors from "cors"
import helmet from "helmet"
import { registerFrontendHosting } from "../frontend-adapters/index.js"

export default class Dispatcher {
    constructor() {
        this.app = express()
        this.server = null
        this.initialized = false

        this.app.disable('x-powered-by')

        if (config?.app?.trustProxy != null) {
            this.app.set('trust proxy', config.app.trustProxy)
        }

        // Security headers (kept conservative; CSP disabled to avoid breaking inline scripts in public/pages)
        this.app.use(helmet({
            contentSecurityPolicy: false
        }))

        this.app.use((req, res, next) => {
            const requestId = randomUUID()
            req.requestId = requestId
            req.requestStartMs = Date.now()
            res.setHeader('X-Request-Id', requestId)
            next()
        })

        // Log completed responses with duration and requestId.
        // For status >= 400 we log only if it wasn't already logged (to avoid duplication).
        this.app.use((req, res, next) => {
            res.once('finish', () => {
                try {
                    const status = res.statusCode

                    const durationMs = typeof req.requestStartMs === 'number'
                        ? (Date.now() - req.requestStartMs)
                        : undefined

                    const ctx = {
                        requestId: req.requestId,
                        method: req.method,
                        path: req.originalUrl,
                        status,
                        durationMs,
                        user_id: req.session?.user_id,
                        profile_id: req.session?.profile_id
                    }

                    if (status >= 400) {
                        if (res?.locals?.__errorLogged) return
                        log.show({
                            type: log.TYPE_WARNING,
                            msg: `${req.method} ${req.originalUrl} ${status}`,
                            ctx
                        })
                        return
                    }

                    log.show({
                        type: log.TYPE_INFO,
                        msg: `${req.method} ${req.originalUrl} ${status}`,
                        ctx
                    })
                } catch { }
            })
            next()
        })

        if (config.cors?.enabled) {
            const allowedOrigins = Array.isArray(config.cors.origins) ? config.cors.origins : []
            this.app.use(cors({
                origin: (origin, callback) => {
                    if (!origin) return callback(null, true)
                    if (allowedOrigins.includes(origin)) return callback(null, true)
                    return callback(new Error(`CORS origin not allowed: ${origin}`))
                },
                credentials: Boolean(config.cors.credentials),
                methods: ['GET', 'POST', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token'],
                exposedHeaders: ['X-Request-Id'],
                optionsSuccessStatus: 204
            }))
        }

        const bodyLimit = config?.app?.bodyLimit ?? '100kb'
        this.app.use(express.json({ limit: bodyLimit }))
        this.app.use(express.urlencoded({ extended: false, limit: bodyLimit }))
        this.session = new Session(this.app)
        this.serverErrors = msgs[config.app.lang].errors.server
        this.clientErrors = msgs[config.app.lang].errors.client
        this.successMsgs = msgs[config.app.lang].success

        // Normalize malformed JSON bodies (Express/body-parser defaults to HTML)
        this.app.use(this.jsonBodySyntaxErrorHandler.bind(this))

        this.loginRateLimiter = rateLimit({
            windowMs: 60 * 1000,
            limit: 10,
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => res
                .status(this.clientErrors.tooManyRequests.code)
                .send(this.clientErrors.tooManyRequests)
        })

        this.toProccessRateLimiter = rateLimit({
            windowMs: 60 * 1000,
            limit: 120,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => {
                const userId = req?.session?.user_id
                return userId ? `user:${userId}` : `ip:${req.ip}`
            },
            handler: (req, res) => res
                .status(this.clientErrors.tooManyRequests.code)
                .send(this.clientErrors.tooManyRequests)
        })
    }

    ensureCsrfToken(req) {
        if (req.session == null) return null
        if (typeof req.session.csrfToken === 'string' && req.session.csrfToken.length > 0) {
            return req.session.csrfToken
        }
        const token = randomBytes(32).toString('hex')
        req.session.csrfToken = token
        return token
    }

    csrfToken(req, res) {
        const token = this.ensureCsrfToken(req)
        if (!token) {
            return res.status(this.clientErrors.unknown.code).send(this.clientErrors.unknown)
        }
        return res.status(200).send({ csrfToken: token })
    }

    csrfProtection(req, res, next) {
        // Preserve previous semantics: if there's no authenticated session yet,
        // keep returning the existing 401 behavior for endpoints that already check auth.
        if ((req.path === '/toProccess' || req.path === '/logout') && !req.session?.user_id) {
            return next()
        }

        const expected = req.session?.csrfToken
        const provided = req.get('X-CSRF-Token')
        if (typeof expected !== 'string' || expected.length === 0) {
            return res.status(this.clientErrors.csrfInvalid.code).send(this.clientErrors.csrfInvalid)
        }
        if (typeof provided !== 'string' || provided !== expected) {
            return res.status(this.clientErrors.csrfInvalid.code).send(this.clientErrors.csrfInvalid)
        }
        return next()
    }

    jsonBodySyntaxErrorHandler(err, req, res, next) {
        const status = err?.status ?? err?.statusCode
        const isEntityParseFailed = err?.type === 'entity.parse.failed'
        const isSyntaxError = err instanceof SyntaxError
        const looksLikeJsonParseError = (status === 400) && (isEntityParseFailed || isSyntaxError)

        if (!looksLikeJsonParseError) return next(err)

        const alert = msgs[config.app.lang].alerts.invalidJson.replace('{value}', 'body')
        return res.status(this.clientErrors.invalidParameters.code).send({
            msg: this.clientErrors.invalidParameters.msg,
            code: this.clientErrors.invalidParameters.code,
            alerts: [alert]
        })
    }

    async init() {
        // Optional pages hosting is registered before API routes.
        await registerFrontendHosting(this.app, { session: this.session, stage: 'preApi' })

        // API routes (always)
        this.app.get('/health', this.health.bind(this))
        this.app.get('/ready', this.ready.bind(this))
        this.app.get("/csrf", this.csrfToken.bind(this))
        this.app.post("/toProccess", this.toProccessRateLimiter, this.csrfProtection.bind(this), this.toProccess.bind(this))
        this.app.post("/login", this.loginRateLimiter, this.csrfProtection.bind(this), this.login.bind(this))
        this.app.post("/logout", this.csrfProtection.bind(this), this.logout.bind(this))

        // Optional SPA hosting is registered after API routes to avoid shadowing them.
        await registerFrontendHosting(this.app, { session: this.session, stage: 'postApi' })

        // Final error handler: keep API contract stable (no default HTML errors)
        this.app.use(this.finalErrorHandler.bind(this))

        this.initialized = true
    }

    health(req, res) {
        return res.status(200).send({
            ok: true,
            name: 'nodejs-backend-architecture',
            uptimeSec: Math.round(process.uptime()),
            time: new Date().toISOString(),
            requestId: req.requestId
        })
    }

    async ready(req, res) {
        // Readiness: Security loaded + DB reachable.
        if (!security?.isReady) {
            return res.status(this.clientErrors.serviceUnavailable.code).send(this.clientErrors.serviceUnavailable)
        }

        try {
            // Minimal DB check.
            await db.pool.query('SELECT 1')
            return res.status(200).send({ ok: true })
        } catch {
            return res.status(this.clientErrors.serviceUnavailable.code).send(this.clientErrors.serviceUnavailable)
        }
    }

    finalErrorHandler(err, req, res, next) {
        if (res.headersSent) return next(err)

        let status = err?.status ?? err?.statusCode
        if (!Number.isInteger(status) || status < 400 || status > 599) status = 500

        // Common infra errors we may emit
        if (typeof err?.message === 'string' && err.message.startsWith('CORS origin not allowed:')) {
            status = 403
        }

        let response = this.clientErrors.unknown
        if (status === 400) response = this.clientErrors.invalidParameters
        else if (status === 413) response = this.clientErrors.payloadTooLarge ?? this.clientErrors.unknown
        else if (status === 401) response = this.serverErrors.unauthorized
        else if (status === 403) response = this.serverErrors.forbidden
        else if (status === 404) response = this.serverErrors.notFound
        else if (status === 503) response = this.clientErrors.serviceUnavailable

        const rawMessage = typeof err?.message === 'string' ? err.message.trim() : ''
        const errorName = typeof err?.name === 'string' && err.name.trim() ? err.name.trim() : undefined
        const errorCode = err?.code != null ? String(err.code) : undefined
        const safeErrorMessage = rawMessage || errorName || errorCode || 'unknown'

        try { res.locals.__errorLogged = true } catch { }
        log.show({
            type: log.TYPE_ERROR,
            msg: `${this.serverErrors.serverError.msg}, unhandled: ${safeErrorMessage}`,
            ctx: {
                requestId: req.requestId,
                method: req.method,
                path: req.originalUrl,
                status,
                user_id: req.session?.user_id,
                profile_id: req.session?.profile_id,
                durationMs: typeof req.requestStartMs === 'number' ? (Date.now() - req.requestStartMs) : undefined,
                errorName,
                errorCode
            }
        })

        return res.status(status).send({
            msg: response.msg,
            code: status,
            alerts: []
        })
    }

    validateToProccessSchema(body) {
        const alerts = []

        const isPlainObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val)
        if (!isPlainObject(body)) {
            alerts.push(v.getMessage('object', { value: body, label: 'body' }))
            return alerts
        }

        const tx = body.tx
        if (!Number.isInteger(tx) || tx <= 0) {
            alerts.push(v.getMessage('int', { value: tx, label: 'tx' }))
        }

        const params = body.params
        if (params !== undefined && params !== null) {
            const isOk =
                (typeof params === 'string') ||
                (typeof params === 'number' && Number.isFinite(params)) ||
                (params !== null && typeof params === 'object' && !Array.isArray(params))

            if (!isOk) {
                alerts.push(msgs[config.app.lang].alerts.paramsType.replace('{value}', 'params'))
            }
        }

        return alerts
    }

    validateLoginSchema(body) {
        const alerts = []
        const isPlainObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val)
        if (!isPlainObject(body)) {
            alerts.push(v.getMessage('object', { value: body, label: 'body' }))
            return alerts
        }

        if (typeof body.username !== 'string') {
            alerts.push(v.getMessage('string', { value: body.username, label: 'username' }))
        }
        if (typeof body.password !== 'string') {
            alerts.push(v.getMessage('string', { value: body.password, label: 'password' }))
        }

        return alerts
    }

    validateLogoutSchema(body) {
        const alerts = []
        if (body == null) return alerts
        const isPlainObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val)
        if (!isPlainObject(body)) {
            alerts.push(v.getMessage('object', { value: body, label: 'body' }))
        }
        return alerts
    }

    async toProccess(req, res) {
        try {
            if (!this.session.sessionExists(req)) return res.status(this.clientErrors.login.code).send(this.clientErrors.login)

            const schemaAlerts = this.validateToProccessSchema(req.body)
            if (schemaAlerts.length > 0) {
                return res.status(this.clientErrors.invalidParameters.code).send({
                    msg: this.clientErrors.invalidParameters.msg,
                    code: this.clientErrors.invalidParameters.code,
                    alerts: schemaAlerts
                })
            }

            if (!security.isReady) {
                try {
                    await security.ready
                } catch {
                    return res.status(this.clientErrors.serviceUnavailable.code).send(this.clientErrors.serviceUnavailable)
                }
            }

            const txData = security.getDataTx(req.body.tx)

            if (!txData) throw new Error(this.serverErrors.txNotFound.msg.replace('{tx}', req.body.tx))
            const data = {
                profile_id: req.session.profile_id,
                method_na: txData.method_na,
                object_na: txData.object_na,
                params: req.body.params
            }

            if (!security.getPermissions(data)) {
                // Best-effort audit (do not block response)
                try {
                    await db.exe('security', 'insertAuditLog', [
                        req.requestId,
                        req.session?.user_id,
                        req.session?.profile_id,
                        'tx_denied',
                        data.object_na,
                        data.method_na,
                        req.body?.tx,
                        JSON.stringify({ reason: 'permissionDenied' })
                    ])
                } catch { }

                return res.status(this.clientErrors.permissionDenied.code).send(this.clientErrors.permissionDenied)
            }

            const response = await security.executeMethod(data)

            // Best-effort audit (do not block response)
            try {
                await db.exe('security', 'insertAuditLog', [
                    req.requestId,
                    req.session?.user_id,
                    req.session?.profile_id,
                    'tx_exec',
                    data.object_na,
                    data.method_na,
                    req.body?.tx,
                    JSON.stringify({ responseCode: response?.code })
                ])
            } catch { }

            res.status(response.code).send(response)
        } catch (err) {
            const status = this.clientErrors.unknown.code
            try { res.locals.__errorLogged = true } catch { }

			// Best-effort audit (do not block error response)
			try {
				const tx = req.body?.tx
				const txData = tx != null ? security.getDataTx(tx) : null
				await db.exe('security', 'insertAuditLog', [
					req.requestId,
					req.session?.user_id,
					req.session?.profile_id,
					'tx_error',
					txData?.object_na,
					txData?.method_na,
					tx,
					JSON.stringify({ error: String(err?.message || err) })
				])
			} catch { }

            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, /toProccess: ${err.message}`,
                ctx: {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    tx: req.body?.tx,
                    object_na: req.body?.tx != null ? security.getDataTx(req.body.tx)?.object_na : undefined,
                    method_na: req.body?.tx != null ? security.getDataTx(req.body.tx)?.method_na : undefined,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                    durationMs: typeof req.requestStartMs === 'number' ? (Date.now() - req.requestStartMs) : undefined
                }
            })
            res.status(status).send(this.clientErrors.unknown)
        }
    }

    async login(req, res) {
        try {
            const schemaAlerts = this.validateLoginSchema(req.body)
            if (schemaAlerts.length > 0) {
                return res.status(this.clientErrors.invalidParameters.code).send({
                    msg: this.clientErrors.invalidParameters.msg,
                    code: this.clientErrors.invalidParameters.code,
                    alerts: schemaAlerts
                })
            }
            await this.session.createSession(req, res)
        } catch (err) {
            const status = this.clientErrors.unknown.code
            try { res.locals.__errorLogged = true } catch { }
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, /login: ${err.message}`,
                ctx: {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    durationMs: typeof req.requestStartMs === 'number' ? (Date.now() - req.requestStartMs) : undefined,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id
                }
            })
            res.status(status).send(this.clientErrors.unknown)
        }
    }

    async logout(req, res) {
        try {
            const schemaAlerts = this.validateLogoutSchema(req.body)
            if (schemaAlerts.length > 0) {
                return res.status(this.clientErrors.invalidParameters.code).send({
                    msg: this.clientErrors.invalidParameters.msg,
                    code: this.clientErrors.invalidParameters.code,
                    alerts: schemaAlerts
                })
            }
            if (this.session.sessionExists(req)) {
				// Best-effort audit (do not block logout)
				try {
					await db.exe('security', 'insertAuditLog', [
						req.requestId,
						req.session?.user_id,
						req.session?.profile_id,
						'logout',
						null,
						null,
						null,
						JSON.stringify({})
					])
				} catch { }

                this.session.destroySession(req)
                return res.status(this.successMsgs.logout.code).send(this.successMsgs.logout)
            } else return res.status(this.clientErrors.login.code).send(this.clientErrors.login)
        } catch (err) {
            const status = this.clientErrors.unknown.code
            try { res.locals.__errorLogged = true } catch { }
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, /logout: ${err.message}`,
                ctx: {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    durationMs: typeof req.requestStartMs === 'number' ? (Date.now() - req.requestStartMs) : undefined,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id
                }
            })
            res.status(status).send(this.clientErrors.unknown)
        }
    }

    serverOn() {
        if (!this.initialized) {
            throw new Error('Dispatcher not initialized. Call await dispatcher.init() before serverOn().')
        }
        this.server = this.app.listen(config.app.port, () =>
            log.show({ type: log.TYPE_INFO, msg: `Server running on http://${config.app.host}:${config.app.port}` })
        )
        return this.server
    }

    async shutdown() {
        try {
            await new Promise((resolve, reject) => {
                if (!this.server) return resolve()
                this.server.close((err) => (err ? reject(err) : resolve()))
            })
        } finally {
            try { await db?.pool?.end?.() } catch { }
        }
    }
}