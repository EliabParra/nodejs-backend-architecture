import bcrypt from "bcryptjs"

import { applySessionMiddleware } from "../express/session/apply-session-middleware.js"
import { auditBestEffort } from "./helpers/audit-log.js"
import { validateLoginSchema } from "./helpers/http-validators.js"

export default class Session {
    constructor(app) {
        applySessionMiddleware(app)
        this.serverErrors = msgs[config.app.lang].errors.server
        this.clientErrors = msgs[config.app.lang].errors.client
        this.successMsgs = msgs[config.app.lang].success
    }

    sessionExists(req) {
        if (req.session && req.session.user_id) return true
        return false
    }

    async createSession(req, res) {
        try {
            const alerts = validateLoginSchema(req.body, { minPasswordLen: 8 })

            if (alerts.length > 0) {
                return res.status(this.clientErrors.invalidParameters.code).send({
                    msg: this.clientErrors.invalidParameters.msg,
                    code: this.clientErrors.invalidParameters.code,
                    alerts
                })
            }

            if (this.sessionExists(req)) {
                return res.status(this.clientErrors.sessionExists.code).send({
                    msg: this.clientErrors.sessionExists.msg,
                    code: this.clientErrors.sessionExists.code
                })
            }

            const result = await db.exe('security', 'getUser', [req.body.username])
            if (!result?.rows || result.rows.length === 0) {
                return res.status(this.clientErrors.usernameOrPasswordIncorrect.code).send(this.clientErrors.usernameOrPasswordIncorrect)
            }

            const user = result.rows[0]
            const storedHash = user.user_pw
            const ok = typeof storedHash === 'string' && await bcrypt.compare(req.body.password, storedHash)
            if (!ok) return res.status(this.clientErrors.usernameOrPasswordIncorrect.code).send(this.clientErrors.usernameOrPasswordIncorrect)

            req.session.user_id = user.user_id
            req.session.user_na = user.user_na
            req.session.profile_id = user.profile_id

            // Best-effort audit/logging fields (do not fail login if this fails)
            try {
                await db.exe('security', 'updateUserLastLogin', [user.user_id])
            } catch { }
            await auditBestEffort(req, {
                action: 'login',
                user_id: user.user_id,
                profile_id: user.profile_id,
                details: { user_na: user.user_na }
            })

            return res.status(this.successMsgs.login.code).send(this.successMsgs.login)
        } catch (err) {
            const status = this.clientErrors.unknown.code
            try { res.locals.__errorLogged = true } catch { }
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Session.createSession: ${err.message}`,
                ctx: {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl,
                    status,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                    durationMs: typeof req.requestStartMs === 'number' ? (Date.now() - req.requestStartMs) : undefined
                }
            })
            res.status(status).send(this.clientErrors.unknown)
        }
    }

    destroySession(req) { req.session.destroy() }
}