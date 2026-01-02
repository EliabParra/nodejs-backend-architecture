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
    constructor() {
        this.ctx = createAppContext()
        this.app = express()
        this.server = null
        this.initialized = false

        this.app.disable('x-powered-by')

        if (config?.app?.trustProxy != null) {
            this.app.set('trust proxy', config.app.trustProxy)
        }

        applyHelmet(this.app)
        applyRequestId(this.app)
        applyRequestLogger(this.app)
        applyCorsIfEnabled(this.app)
        applyBodyParsers(this.app)

        this.session = new Session(this.app, this.ctx)
        this.serverErrors = msgs[config.app.lang].errors.server
        this.clientErrors = msgs[config.app.lang].errors.client
        this.successMsgs = msgs[config.app.lang].success

        // Normalize malformed JSON bodies (Express/body-parser defaults to HTML)
        this.app.use(jsonBodySyntaxErrorHandler)

        this.loginRateLimiter = createLoginRateLimiter(this.clientErrors)
        this.toProccessRateLimiter = createToProccessRateLimiter(this.clientErrors)
        this.authPasswordResetRateLimiter = createAuthPasswordResetRateLimiter(this.clientErrors)
    }

    async init() {
        // Optional pages hosting is registered before API routes.
        await registerFrontendHosting(this.app, { session: this.session, stage: 'preApi' })

        // API routes (always)
        this.app.get('/health', createHealthHandler({ name: config?.app?.name ?? 'app' }))
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

    async toProccess(req, res) {
        let effectiveProfileId = null
        try {
            const hasSession = this.session.sessionExists(req)
            const publicProfileId = Number(config?.auth?.publicProfileId)
            effectiveProfileId = hasSession
                ? req.session.profile_id
                : Number.isInteger(publicProfileId) && publicProfileId > 0
                  ? publicProfileId
                  : null

            if (!hasSession && effectiveProfileId == null) {
                return res.status(this.clientErrors.login.code).send(this.clientErrors.login)
            }

            const schemaAlerts = validateToProccessSchema(req.body)
            if (schemaAlerts.length > 0) {
                return sendInvalidParameters(res, this.clientErrors.invalidParameters, schemaAlerts)
            }

            if (!security.isReady) {
                try {
                    await security.ready
                } catch {
                    return res
                        .status(this.clientErrors.serviceUnavailable.code)
                        .send(this.clientErrors.serviceUnavailable)
                }
            }

            const txData = security.getDataTx(req.body.tx)

            if (!txData)
                throw new Error(this.serverErrors.txNotFound.msg.replace('{tx}', req.body.tx))

            // For security-sensitive Auth flows triggered via /toProccess, attach request context
            // from the server (never trust client-provided values).
            let effectiveParams = req.body.params
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
                    effectiveParams = {
                        ...(req.body.params ?? {}),
                        _request: {
                            ip: req.ip ?? null,
                            userAgent: req.get('User-Agent') ?? null,
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

            if (!security.getPermissions(data)) {
                await auditBestEffort(req, {
                    action: 'tx_denied',
                    object_na: data.object_na,
                    method_na: data.method_na,
                    tx: req.body?.tx,
                    profile_id: effectiveProfileId,
                    details: { reason: 'permissionDenied' },
                })

                return res
                    .status(this.clientErrors.permissionDenied.code)
                    .send(this.clientErrors.permissionDenied)
            }

            const response = await security.executeMethod(data)

            await auditBestEffort(req, {
                action: 'tx_exec',
                object_na: data.object_na,
                method_na: data.method_na,
                tx: req.body?.tx,
                profile_id: effectiveProfileId,
                details: { responseCode: response?.code },
            })

            res.status(response.code).send(response)
        } catch (err) {
            const status = this.clientErrors.unknown.code
            try {
                res.locals.__errorLogged = true
            } catch {}

            const tx = req.body?.tx
            const txData = tx != null ? security.getDataTx(tx) : null
            await auditBestEffort(req, {
                action: 'tx_error',
                object_na: txData?.object_na,
                method_na: txData?.method_na,
                tx,
                profile_id: effectiveProfileId,
                details: { error: String(err?.message || err) },
            })

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
                    tx: req.body?.tx,
                    object_na:
                        req.body?.tx != null
                            ? security.getDataTx(req.body.tx)?.object_na
                            : undefined,
                    method_na:
                        req.body?.tx != null
                            ? security.getDataTx(req.body.tx)?.method_na
                            : undefined,
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

    async login(req, res) {
        try {
            const schemaAlerts = validateLoginSchema(req.body)
            if (schemaAlerts.length > 0) {
                return sendInvalidParameters(res, this.clientErrors.invalidParameters, schemaAlerts)
            }
            await this.session.createSession(req, res)
        } catch (err) {
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

    async verifyLogin(req, res) {
        try {
            const schemaAlerts = validateLoginVerifySchema(req.body)
            if (schemaAlerts.length > 0) {
                return sendInvalidParameters(res, this.clientErrors.invalidParameters, schemaAlerts)
            }
            await this.session.verifyLoginChallenge(req, res)
        } catch (err) {
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

    async logout(req, res) {
        try {
            const schemaAlerts = validateLogoutSchema(req.body)
            if (schemaAlerts.length > 0) {
                return sendInvalidParameters(res, this.clientErrors.invalidParameters, schemaAlerts)
            }
            if (this.session.sessionExists(req)) {
                await auditBestEffort(req, { action: 'logout', details: {} })

                this.session.destroySession(req)
                return res.status(this.successMsgs.logout.code).send(this.successMsgs.logout)
            } else return res.status(this.clientErrors.login.code).send(this.clientErrors.login)
        } catch (err) {
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
            await new Promise((resolve, reject) => {
                if (!this.server) return resolve()
                this.server.close((err) => (err ? reject(err) : resolve()))
            })
        } finally {
            try {
                await db?.pool?.end?.()
            } catch {}
        }
    }
}
