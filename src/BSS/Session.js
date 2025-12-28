import session from "express-session"

export default class Session {
    constructor(app) {
        this.session = session
        app.use(this.session(config.session))
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
            db.exe('security', 'getUser', [req.body.username, req.body.password]).then(result => {
                if (this.sessionExists(req)) return res.status(this.clientErrors.sessionExists.code).send({ msg: this.clientErrors.sessionExists.msg, code: this.clientErrors.sessionExists.code })
                if (result.rows.length > 0) {
                    req.session.user_id = result.rows[0].user_id
                    req.session.user_na = result.rows[0].user_na
                    req.session.profile_id = result.rows[0].profile_id
                    return res.status(this.successMsgs.login.code).send(this.successMsgs.login)
                } else return res.status(this.clientErrors.usernameOrPasswordIncorrect.code).send(this.clientErrors.usernameOrPasswordIncorrect)
            })
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.serverError.msg}, Session.createSession: ${err.message}` })
            res.status(this.clientErrors.unknown.code).send(this.clientErrors.unknown)
        }
    }

    destroySession(req) { req.session.destroy() }
}