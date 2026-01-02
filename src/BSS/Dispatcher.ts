import Session from './Session.js'
import express from 'express'
import { registerFrontendHosting } from '../frontend-adapters/index.js'
import { createAppContext } from '../context/app-context.js'

import { applyHelmet } from '../express/middleware/helmet.js'
import { applyRequestId } from '../express/middleware/request-id.js'
import { applyRequestLogger } from '../express/middleware/request-logger.js'
import { applyCorsIfEnabled } from '../express/middleware/cors.js'
import { applyBodyParsers } from '../express/middleware/body-parsers.js'
import { jsonBodySyntaxErrorHandler } from '../express/middleware/json-syntax-error.js'
import { csrfProtection, csrfTokenHandler } from '../express/middleware/csrf.js'
import {
    createLoginRateLimiter,
    createToProccessRateLimiter,
    createAuthPasswordResetRateLimiter,
} from '../express/rate-limit/limiters.js'
import { createHealthHandler } from '../express/handlers/health.js'
import { createReadyHandler } from '../express/handlers/ready.js'
import { createFinalErrorHandler } from '../express/middleware/final-error-handler.js'

import {
    isPlainObject,
    parseToProccessBody,
    validateLoginSchema,
    validateLoginVerifySchema,
    validateLogoutSchema,
    validateToProccessSchema,
} from './helpers/http-validators.js'

import { auditBestEffort } from './helpers/audit-log.js'
import { sendInvalidParameters } from './helpers/http-responses.js'
import { redactSecretsInString } from '../helpers/sanitize.js'

/**
 * Express API orchestrator.
 *
 * Responsibilities:
 * - Compose Express "plumbing" (middlewares/handlers in `src/express/*`)
 * - Register API routes: `/health`, `/ready`, `/csrf`, `/login`, `/logout`, `/toProccess`
 * - Delegate auth/session rules to `Session`
 * - Delegate business execution to `Security` (tx -> BO dynamic dispatch)
 */
export default class Dispatcher {
    app: any
    server: any
    initialized: boolean
    session: any
    serverErrors: any
    clientErrors: any
    successMsgs: any
    loginRateLimiter: any
    toProccessRateLimiter: any
    authPasswordResetRateLimiter: any
    ctx: AppContext

    constructor() {
        this.ctx = createAppContext()
        const effectiveConfig = this.ctx?.config ?? config
        const effectiveMsgs = this.ctx?.msgs ?? msgs
        this.app = express()
        this.server = null
        this.initialized = false

        this.app.disable('x-powered-by')

        if (effectiveConfig?.app?.trustProxy != null) {
            this.app.set('trust proxy', effectiveConfig.app.trustProxy)
        }

        applyHelmet(this.app)
        applyRequestId(this.app)
        applyRequestLogger(this.app)
        applyCorsIfEnabled(this.app)
        applyBodyParsers(this.app)

        this.session = new Session(this.app, this.ctx)
        this.serverErrors = effectiveMsgs[effectiveConfig.app.lang].errors.server
        this.clientErrors = effectiveMsgs[effectiveConfig.app.lang].errors.client
        this.successMsgs = effectiveMsgs[effectiveConfig.app.lang].success

        // Normalize malformed JSON bodies (Express/body-parser defaults to HTML)
        this.app.use(jsonBodySyntaxErrorHandler)

        this.loginRateLimiter = createLoginRateLimiter(this.clientErrors)
        this.toProccessRateLimiter = createToProccessRateLimiter(this.clientErrors)
        this.authPasswordResetRateLimiter = createAuthPasswordResetRateLimiter(this.clientErrors)
    }

    async init() {
        const effectiveConfig = this.ctx?.config ?? config
        // Optional pages hosting is registered before API routes.
        await registerFrontendHosting(this.app, { session: this.session, stage: 'preApi' })

        // API routes (always)
        this.app.get('/health', createHealthHandler({ name: effectiveConfig?.app?.name ?? 'app' }))
        this.app.get('/ready', createReadyHandler({ clientErrors: this.clientErrors }))
        this.app.get('/csrf', csrfTokenHandler)
        this.app.post(
            '/toProccess',
            this.toProccessRateLimiter,
            this.authPasswordResetRateLimiter,
            csrfProtection,
            this.toProccess.bind(this)
        )
        this.app.post('/login', this.loginRateLimiter, csrfProtection, this.login.bind(this))
        this.app.post(
            '/login/verify',
            this.loginRateLimiter,
            csrfProtection,
            this.verifyLogin.bind(this)
        )
        this.app.post('/logout', csrfProtection, this.logout.bind(this))

        // Optional SPA hosting is registered after API routes to avoid shadowing them.
        await registerFrontendHosting(this.app, { session: this.session, stage: 'postApi' })

        // Final error handler: keep API contract stable (no default HTML errors)
        this.app.use(
            createFinalErrorHandler({
                clientErrors: this.clientErrors,
                serverErrors: this.serverErrors,
            })
        )

        this.initialized = true
    }

    async toProccess(req: AppRequest, res: AppResponse) {
        let effectiveProfileId: number | null = null
        try {
            const effectiveConfig = this.ctx?.config ?? config
            const effectiveSecurity = this.ctx?.security ?? security

            const hasSession = this.session.sessionExists(req)
            const publicProfileId = Number(effectiveConfig?.auth?.publicProfileId)
            effectiveProfileId = hasSession
                ? (req.session?.profile_id ?? null)
                : Number.isInteger(publicProfileId) && publicProfileId > 0
                  ? publicProfileId
                  : null

            if (!hasSession && effectiveProfileId == null) {
                return res.status(this.clientErrors.login.code).send(this.clientErrors.login)
            }

            const parsed = parseToProccessBody(req.body)
            if (parsed.ok === false) {
                return sendInvalidParameters(
                    res,
                    this.clientErrors.invalidParameters,
                    parsed.alerts
                )
            }

            if (!effectiveSecurity.isReady) {
                try {
                    await effectiveSecurity.ready
                } catch {
                    return res
                        .status(this.clientErrors.serviceUnavailable.code)
                        .send(this.clientErrors.serviceUnavailable)
                }
            }

            const body = parsed.body
            const tx = body.tx
            const txData = tx != null ? effectiveSecurity.getDataTx(tx) : null

            if (!txData)
                throw new Error(this.serverErrors.txNotFound.msg.replace('{tx}', String(tx)))

            // For security-sensitive Auth flows triggered via /toProccess, attach request context
            // from the server (never trust client-provided values).
            let effectiveParams = body.params
            if (txData?.object_na === 'Auth') {
                const method = txData?.method_na
                if (
                    method === 'register' ||
                    method === 'requestEmailVerification' ||
                    method === 'verifyEmail' ||
                    method === 'requestPasswordReset' ||
                    method === 'verifyPasswordReset' ||
                    method === 'resetPassword'
                ) {
                    const baseParams =
                        body.params &&
                        typeof body.params === 'object' &&
                        !Array.isArray(body.params)
                            ? body.params
                            : {}
                    effectiveParams = {
                        ...baseParams,
                        _request: {
                            ip: req.ip ?? null,
                            userAgent: req.get?.('User-Agent') ?? null,
                        },
                    }
                }
            }
            const data = {
                profile_id: effectiveProfileId,
                method_na: txData.method_na,
                object_na: txData.object_na,
                params: effectiveParams,
            }

            if (!effectiveSecurity.getPermissions(data)) {
                await auditBestEffort(
                    req,
                    {
                        action: 'tx_denied',
                        object_na: data.object_na,
                        method_na: data.method_na,
                        tx,
                        profile_id: effectiveProfileId,
                        details: { reason: 'permissionDenied' },
                    },
                    this.ctx
                )

                return res
                    .status(this.clientErrors.permissionDenied.code)
                    .send(this.clientErrors.permissionDenied)
            }

            const response = await effectiveSecurity.executeMethod(data)

            await auditBestEffort(
                req,
                {
                    action: 'tx_exec',
                    object_na: data.object_na,
                    method_na: data.method_na,
                    tx,
                    profile_id: effectiveProfileId,
                    details: { responseCode: response?.code },
                },
                this.ctx
            )

            res.status(response.code).send(response)
        } catch (err: any) {
            const status = this.clientErrors.unknown.code
            try {
                res.locals.__errorLogged = true
            } catch {}

            const tx = isPlainObject(req.body) ? req.body.tx : undefined
            const effectiveSecurity = this.ctx?.security ?? security
            const txData = tx != null ? effectiveSecurity.getDataTx(tx) : null
            await auditBestEffort(
                req,
                {
                    action: 'tx_error',
                    object_na: txData?.object_na,
                    method_na: txData?.method_na,
                    tx,
                    profile_id: effectiveProfileId,
                    details: { error: String(err?.message || err) },
                },
                this.ctx
            )

            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, /toProccess: ${redactSecretsInString(
                    err?.message || err
                )}`,
                ctx: {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    tx,
                    object_na: tx != null ? effectiveSecurity.getDataTx(tx)?.object_na : undefined,
                    method_na: tx != null ? effectiveSecurity.getDataTx(tx)?.method_na : undefined,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                    durationMs:
                        typeof req.requestStartMs === 'number'
                            ? Date.now() - req.requestStartMs
                            : undefined,
                },
            })
            res.status(status).send(this.clientErrors.unknown)
        }
    }

    async login(req: AppRequest, res: AppResponse) {
        try {
            const schemaAlerts = validateLoginSchema(req.body)
            if (schemaAlerts.length > 0) {
                return sendInvalidParameters(res, this.clientErrors.invalidParameters, schemaAlerts)
            }
            await this.session.createSession(req, res)
        } catch (err: any) {
            const status = this.clientErrors.unknown.code
            try {
                res.locals.__errorLogged = true
            } catch {}
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, /login: ${redactSecretsInString(
                    err?.message || err
                )}`,
                ctx: {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    durationMs:
                        typeof req.requestStartMs === 'number'
                            ? Date.now() - req.requestStartMs
                            : undefined,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                },
            })
            res.status(status).send(this.clientErrors.unknown)
        }
    }

    async verifyLogin(req: AppRequest, res: AppResponse) {
        try {
            const schemaAlerts = validateLoginVerifySchema(req.body)
            if (schemaAlerts.length > 0) {
                return sendInvalidParameters(res, this.clientErrors.invalidParameters, schemaAlerts)
            }
            await this.session.verifyLoginChallenge(req, res)
        } catch (err: any) {
            const status = this.clientErrors.unknown.code
            try {
                res.locals.__errorLogged = true
            } catch {}
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, /login/verify: ${redactSecretsInString(
                    err?.message || err
                )}`,
                ctx: {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    durationMs:
                        typeof req.requestStartMs === 'number'
                            ? Date.now() - req.requestStartMs
                            : undefined,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                },
            })
            res.status(status).send(this.clientErrors.unknown)
        }
    }

    async logout(req: AppRequest, res: AppResponse) {
        try {
            const schemaAlerts = validateLogoutSchema(req.body)
            if (schemaAlerts.length > 0) {
                return sendInvalidParameters(res, this.clientErrors.invalidParameters, schemaAlerts)
            }
            if (this.session.sessionExists(req)) {
                await auditBestEffort(req, { action: 'logout', details: {} }, this.ctx)

                this.session.destroySession(req)
                return res.status(this.successMsgs.logout.code).send(this.successMsgs.logout)
            }
            return res.status(this.clientErrors.login.code).send(this.clientErrors.login)
        } catch (err: any) {
            const status = this.clientErrors.unknown.code
            try {
                res.locals.__errorLogged = true
            } catch {}
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, /logout: ${redactSecretsInString(
                    err?.message || err
                )}`,
                ctx: {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    durationMs:
                        typeof req.requestStartMs === 'number'
                            ? Date.now() - req.requestStartMs
                            : undefined,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                },
            })
            res.status(status).send(this.clientErrors.unknown)
        }
    }

    serverOn() {
        if (!this.initialized) {
            throw new Error(
                'Dispatcher not initialized. Call await dispatcher.init() before serverOn().'
            )
        }
        this.server = this.app.listen(config.app.port, () =>
            log.show({
                type: log.TYPE_INFO,
                msg: `Server running on http://${config.app.host}:${config.app.port}`,
            })
        )
        return this.server
    }

    async shutdown() {
        try {
            await new Promise<void>((resolve, reject) => {
                if (!this.server) return resolve()
                this.server.close((err: any) => (err ? reject(err) : resolve()))
            })
        } finally {
            try {
                const pool = (db as unknown as { pool?: { end?: () => Promise<void> | void } })
                    ?.pool
                await pool?.end?.()
            } catch {}
        }
    }
}
