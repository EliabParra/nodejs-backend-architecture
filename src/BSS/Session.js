import session from "express-session"

export default class Session {
    constructor(app) {
        this.session = session
        app.use(this.session(config.session))
    }

    sessionExists(req) {
        if (req.session && req.session.user_id) return true
        return false
    }

    createSession(req, res) {
        try {
            if (!v.validateAll([req.body.username, { value: req.body.password, min: 8 }], ['string', 'length']))
                return res.status(400).send({ msg: "parámetros inválidos", alerts: v.getAlerts() })
            db.exe('security', 'getUser', [req.body.username, req.body.password]).then(result => {
                if (this.sessionExists(req)) return res.status(401).send({ msg: "sesion ya existe" })
                if (result.rows.length > 0) {
                    req.session.user_id = result.rows[0].user_id
                    req.session.user_na = result.rows[0].user_na
                    req.session.profile_id = result.rows[0].profile_id
                    return res.send({ msg: "sesion creada" })
                } else return res.status(401).send({ msg: "usuario o contraseña incorrectos" })
            })
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `Exception in Session.createSession: ${err.message}` })
            res.status(500).send({ msg: 'error de servidor' })
        }
    }

    destroySession(req) { req.session.destroy() }
}