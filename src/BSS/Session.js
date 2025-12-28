import session from "express-session"
import bcrypt from "bcryptjs"

export default class Session {
    constructor(app) {
        this.session = session

        const sessionConfig = JSON.parse(JSON.stringify(config.session ?? {}))
        sessionConfig.cookie = sessionConfig.cookie ?? {}

        if (sessionConfig.cookie.httpOnly == null) sessionConfig.cookie.httpOnly = true

        if (typeof sessionConfig.cookie.sameSite === 'boolean') {
            sessionConfig.cookie.sameSite = sessionConfig.cookie.sameSite ? 'lax' : 'strict'
        }

        if (sessionConfig.cookie.maxAge == null && sessionConfig.duration != null) {
            sessionConfig.cookie.maxAge = sessionConfig.duration
        }

        if (sessionConfig.cookie.sameSite === 'none' && sessionConfig.cookie.secure !== true) {
            log.show({
                type: log.TYPE_WARNING,
                msg: 'Session cookie sameSite="none" without secure=true. Browsers will reject this cookie in most cases.'
            })
        }

        if (sessionConfig.cookie.secure === true) {
            app.set('trust proxy', 1)
            sessionConfig.proxy = true
        }

        app.use(this.session(sessionConfig))
        this.serverErrors = msgs[config.app.lang].errors.server
        this.clientErrors = msgs[config.app.lang].errors.client
        this.successMsgs = msgs[config.app.lang].success
    }

    sessionExists(req) {
        if (req.session && req.session.user_id) return true
        return false
    }

    createSession(req, res) {
        try {
            if (!v.validateAll([req.body.username, { value: req.body.password, min: 8 }], ['string', 'length']))
                return res.status(this.clientErrors.invalidParameters.code).send({
                    msg: this.clientErrors.invalidParameters.msg,
                    code: this.clientErrors.invalidParameters.code,
                    alerts: v.getAlerts()
                })
            db.exe('security', 'getUser', [req.body.username]).then(async (result) => {
                if (this.sessionExists(req)) return res.status(this.clientErrors.sessionExists.code).send({ msg: this.clientErrors.sessionExists.msg, code: this.clientErrors.sessionExists.code })
                if (!result || !result.rows) return res.status(this.clientErrors.unknown.code).send(this.clientErrors.unknown)
                if (result.rows.length === 0) return res.status(this.clientErrors.usernameOrPasswordIncorrect.code).send(this.clientErrors.usernameOrPasswordIncorrect)

                const user = result.rows[0]
                const storedHash = user.user_pw
                const ok = typeof storedHash === 'string' && await bcrypt.compare(req.body.password, storedHash)
                if (!ok) return res.status(this.clientErrors.usernameOrPasswordIncorrect.code).send(this.clientErrors.usernameOrPasswordIncorrect)

                req.session.user_id = user.user_id
                req.session.user_na = user.user_na
                req.session.profile_id = user.profile_id
                return res.status(this.successMsgs.login.code).send(this.successMsgs.login)
            })
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.serverError.msg}, Session.createSession: ${err.message}` })
            res.status(this.clientErrors.unknown.code).send(this.clientErrors.unknown)
        }
    }

    destroySession(req) { req.session.destroy() }
}