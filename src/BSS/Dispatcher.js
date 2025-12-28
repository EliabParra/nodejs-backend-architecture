import Session from "./Session.js"
import express from "express"
import { buildPagesRouter, pagesPath } from "../router/pages.js"
import rateLimit from "express-rate-limit"
import { randomUUID } from "node:crypto"

export default class Dispatcher {
    constructor() {
        this.app = express()

        this.app.use((req, res, next) => {
            const requestId = randomUUID()
            req.requestId = requestId
            req.requestStartMs = Date.now()
            res.setHeader('X-Request-Id', requestId)
            next()
        })

        this.app.use(express.json())
        this.app.use(express.urlencoded({ extended: false }))
        this.app.use(express.static(pagesPath))
        this.session = new Session(this.app)
        this.serverErrors = msgs[config.app.lang].errors.server
        this.clientErrors = msgs[config.app.lang].errors.client
        this.successMsgs = msgs[config.app.lang].success

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

        this.init()
    }

    init() {
        this.app.use(buildPagesRouter({ session: this.session }))
        this.app.post("/toProccess", this.toProccessRateLimiter, this.toProccess.bind(this))
        this.app.post("/login", this.loginRateLimiter, this.login.bind(this))
        this.app.post("/logout", this.logout.bind(this))        
    }

    async toProccess(req, res) {
        try {
            if (!this.session.sessionExists(req)) return res.status(this.clientErrors.login.code).send(this.clientErrors.login)

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

            if (!security.getPermissions(data)) return res.status(this.clientErrors.permissionDenied.code).send(this.clientErrors.permissionDenied)
            const response = await security.executeMethod(data)
            res.status(response.code).send(response)
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, /toProccess: ${err.message}`,
                ctx: {
                    requestId: req.requestId,
                    tx: req.body?.tx,
                    object_na: req.body?.tx != null ? security.getDataTx(req.body.tx)?.object_na : undefined,
                    method_na: req.body?.tx != null ? security.getDataTx(req.body.tx)?.method_na : undefined,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                    durationMs: typeof req.requestStartMs === 'number' ? (Date.now() - req.requestStartMs) : undefined
                }
            })
            res.status(this.clientErrors.unknown.code).send(this.clientErrors.unknown)
        }
    }

    login(req, res) {
        try {
            this.session.createSession(req, res)
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.serverError.msg}, /login: ${err.message}` })
            res.status(this.clientErrors.unknown.code).send(this.clientErrors.unknown)
        }
    }

    logout(req, res) {
        try {
            if (this.session.sessionExists(req)) {
                this.session.destroySession(req)
                return res.status(this.successMsgs.logout.code).send(this.successMsgs.logout)
            } else return res.status(this.clientErrors.login.code).send(this.clientErrors.login)
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.serverError.msg}, /logout: ${err.message}` })
            res.status(this.clientErrors.unknown.code).send(this.clientErrors.unknown)
        }
    }

    serverOn() {
        this.app.listen(config.app.port, () => log.show({ type: log.TYPE_INFO, msg: `Server running on http://${config.app.host}:${config.app.port}` }))
    }
}