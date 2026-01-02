import nodemailer from 'nodemailer'

function isConfiguredForSmtp(emailCfg) {
    return Boolean(
        emailCfg &&
        typeof emailCfg.smtpHost === 'string' &&
        emailCfg.smtpHost.length > 0 &&
        Number.isInteger(emailCfg.smtpPort) &&
        emailCfg.smtpPort > 0
    )
}

function maskEmail(email) {
    const s = String(email ?? '').trim()
    const at = s.indexOf('@')
    if (at <= 1) return '***'
    const local = s.slice(0, at)
    const domain = s.slice(at + 1)
    const head = local.slice(0, 2)
    return `${head}***@${domain}`
}

function buildTransport(emailCfg) {
    return nodemailer.createTransport({
        host: emailCfg.smtpHost,
        port: emailCfg.smtpPort,
        secure: Boolean(emailCfg.smtpSecure),
        auth:
            emailCfg.smtpUser && emailCfg.smtpPass
                ? { user: emailCfg.smtpUser, pass: emailCfg.smtpPass }
                : undefined,
    })
}

export default class EmailService {
    constructor() {
        this.cfg = config.email ?? {}
        this.mode = String(this.cfg.mode ?? 'log')
            .trim()
            .toLowerCase()
        this.from = String(this.cfg.from ?? 'no-reply@example.com')
        this.logIncludeSecrets =
            Boolean(this.cfg.logIncludeSecrets) || process.env.NODE_ENV === 'test'

        this._transport = null
        if (this.mode === 'smtp' && isConfiguredForSmtp(this.cfg)) {
            this._transport = buildTransport(this.cfg)
        }
    }

    maskEmail(email) {
        return maskEmail(email)
    }

    async sendLoginChallenge({ to, token, code, appName }) {
        const subject = `${appName ?? 'App'} - Verificación de inicio de sesión`
        const text = `Tu inicio de sesión requiere verificación.\n\nToken: ${token}\nCódigo: ${code}\n\nSi no fuiste tú, ignora este mensaje.`

        if (this.mode !== 'smtp' || !this._transport) {
            log.show({
                type: log.TYPE_INFO,
                msg: `[Email:${this.mode}] Would send login challenge to=${to} subject=${subject}`,
                ctx: this.logIncludeSecrets ? { to, subject, token, code } : { to, subject },
            })
            return { ok: true, mode: this.mode }
        }

        await this._transport.sendMail({
            from: this.from,
            to,
            subject,
            text,
        })
        return { ok: true, mode: 'smtp' }
    }

    async sendPasswordReset({ to, token, code, appName }) {
        const subject = `${appName ?? 'App'} - Restablecer contraseña`
        const text = `Solicitud para restablecer contraseña.\n\nToken: ${token}\nCódigo: ${code}\n\nSi no fuiste tú, ignora este mensaje.`

        if (this.mode !== 'smtp' || !this._transport) {
            log.show({
                type: log.TYPE_INFO,
                msg: `[Email:${this.mode}] Would send password reset to=${to} subject=${subject}`,
                ctx: this.logIncludeSecrets ? { to, subject, token, code } : { to, subject },
            })
            return { ok: true, mode: this.mode }
        }

        await this._transport.sendMail({
            from: this.from,
            to,
            subject,
            text,
        })
        return { ok: true, mode: 'smtp' }
    }

    async sendEmailVerification({ to, token, code, appName }) {
        const subject = `${appName ?? 'App'} - Verificar email`
        const text = `Verificación de email requerida.

Token: ${token}
Código: ${code}

Si no fuiste tú, ignora este mensaje.`

        if (this.mode !== 'smtp' || !this._transport) {
            log.show({
                type: log.TYPE_INFO,
                msg: `[Email:${this.mode}] Would send email verification to=${to} subject=${subject}`,
                ctx: this.logIncludeSecrets ? { to, subject, token, code } : { to, subject },
            })
            return { ok: true, mode: this.mode }
        }

        await this._transport.sendMail({
            from: this.from,
            to,
            subject,
            text,
        })
        return { ok: true, mode: 'smtp' }
    }
}
