import session from "express-session"
import bcrypt from "bcryptjs"
import connectPgSimple from "connect-pg-simple"

export default class Session {
    constructor(app) {
        this.session = session

        const PgSession = connectPgSimple(session)

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
            // When running behind a proxy/LB that terminates TLS, secure cookies require trust proxy.
            // Don't override an explicit app-level trust proxy setting.
            if (app.get('trust proxy') == null) {
                app.set('trust proxy', 1)
            }
            sessionConfig.proxy = true
        }

        if (sessionConfig.store?.type === 'pg') {
            const tableName = sessionConfig.store?.tableName || 'session'
            const ttlSecondsFromCookie = typeof sessionConfig.cookie?.maxAge === 'number'
                ? Math.ceil(sessionConfig.cookie.maxAge / 1000)
                : undefined
            const ttlSeconds = sessionConfig.store?.ttlSeconds ?? ttlSecondsFromCookie
            const pruneIntervalSeconds = sessionConfig.store?.pruneIntervalSeconds ?? 300
            sessionConfig.store = new PgSession({
                pool: db.pool,
                tableName,
                ...(ttlSeconds != null ? { ttl: ttlSeconds } : {}),
                ...(pruneIntervalSeconds != null ? { pruneSessionInterval: pruneIntervalSeconds } : {})
            })
        } else {
            delete sessionConfig.store
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

    async createSession(req, res) {
        try {
            if (!v.validateAll([req.body.username, { value: req.body.password, min: 8 }], ['string', 'length']))
                return res.status(this.clientErrors.invalidParameters.code).send({
                    msg: this.clientErrors.invalidParameters.msg,
                    code: this.clientErrors.invalidParameters.code,
                    alerts: v.getAlerts()
                })

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
            return res.status(this.successMsgs.login.code).send(this.successMsgs.login)
        } catch (err) {
            try { res.locals.__errorLogged = true } catch { }
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Session.createSession: ${err.message}`,
                ctx: {
                    requestId: req.requestId,
                    user_id: req.session?.user_id,
                    profile_id: req.session?.profile_id,
                    durationMs: typeof req.requestStartMs === 'number' ? (Date.now() - req.requestStartMs) : undefined
                }
            })
            res.status(this.clientErrors.unknown.code).send(this.clientErrors.unknown)
        }
    }

    destroySession(req) { req.session.destroy() }
}