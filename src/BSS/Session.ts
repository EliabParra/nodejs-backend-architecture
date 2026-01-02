import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'

import { applySessionMiddleware } from '../express/session/apply-session-middleware.js'
import { auditBestEffort } from './helpers/audit-log.js'
import { redactSecretsInString } from '../helpers/sanitize.js'
import { validateLoginSchema } from './helpers/http-validators.js'
import EmailService from './EmailService.js'

function sha256Hex(value: unknown) {
    return createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function getCookie(req: any, name: string) {
    const header = req.headers?.cookie
    if (typeof header !== 'string' || header.length === 0) return null
    const parts = header.split(';')
    for (const part of parts) {
        const i = part.indexOf('=')
        if (i <= 0) continue
        const k = part.slice(0, i).trim()
        if (k !== name) continue
        return decodeURIComponent(part.slice(i + 1).trim())
    }
    return null
}

/**
 * Session/auth orchestrator.
 *
 * Uses cookie-based sessions (`express-session`) wired by `applySessionMiddleware(app)`.
 * Implements login/logout and the canonical "session exists" rule.
 */
export default class Session {
    ctx?: AppContext

    serverErrors: any
    clientErrors: any
    successMsgs: any

    email: any
    authCfg: any

    loginId: string
    login2StepNewDevice: boolean
    deviceCookieName: string
    deviceCookieMaxAgeMs: number
    loginChallengeExpiresSeconds: number
    loginChallengeMaxAttempts: number
    requireEmailVerification: boolean

    /** @param {import('express').Express} app @param {AppContext=} ctx */
    constructor(app: any, ctx?: AppContext) {
        this.ctx = ctx
        applySessionMiddleware(app)
        const effectiveConfig = this.ctx?.config ?? config
        this.serverErrors = msgs[effectiveConfig.app.lang].errors.server
        this.clientErrors = msgs[effectiveConfig.app.lang].errors.client
        this.successMsgs = msgs[effectiveConfig.app.lang].success
        this.email = new (EmailService as any)(this.ctx)

        this.authCfg = effectiveConfig.auth ?? {}
        this.loginId = String(this.authCfg.loginId ?? 'email')
            .trim()
            .toLowerCase()
        this.login2StepNewDevice = Boolean(this.authCfg.login2StepNewDevice)
        this.deviceCookieName = String(this.authCfg.deviceCookieName ?? 'device_token')
        this.deviceCookieMaxAgeMs = Number(this.authCfg.deviceCookieMaxAgeMs ?? 15552000000)
        this.loginChallengeExpiresSeconds = Number(this.authCfg.loginChallengeExpiresSeconds ?? 600)
        this.loginChallengeMaxAttempts = Number(this.authCfg.loginChallengeMaxAttempts ?? 5)

        this.requireEmailVerification = Boolean(this.authCfg.requireEmailVerification)
    }

    sessionExists(req: AppRequest) {
        if ((req as any).session && (req as any).session.user_id) return true
        return false
    }

    async createSession(req: AppRequest, res: AppResponse) {
        try {
            const alerts = validateLoginSchema((req as any).body, { minPasswordLen: 8 })

            if (alerts.length > 0) {
                return (res as any).status(this.clientErrors.invalidParameters.code).send({
                    msg: this.clientErrors.invalidParameters.msg,
                    code: this.clientErrors.invalidParameters.code,
                    alerts,
                })
            }

            if (this.sessionExists(req)) {
                return (res as any).status(this.clientErrors.sessionExists.code).send({
                    msg: this.clientErrors.sessionExists.msg,
                    code: this.clientErrors.sessionExists.code,
                })
            }

            const identifier = (req as any).body.username
            const queryName = this.loginId === 'username' ? 'getUserByUsername' : 'getUserByEmail'
            const result = await db.exe('security', queryName, [identifier])
            if (!result?.rows || result.rows.length === 0) {
                return (res as any)
                    .status(this.clientErrors.usernameOrPasswordIncorrect.code)
                    .send(this.clientErrors.usernameOrPasswordIncorrect)
            }

            const user = result.rows[0]
            const storedHash = user.user_pw
            const ok =
                typeof storedHash === 'string' &&
                (await bcrypt.compare((req as any).body.password, storedHash))
            if (!ok)
                return (res as any)
                    .status(this.clientErrors.usernameOrPasswordIncorrect.code)
                    .send(this.clientErrors.usernameOrPasswordIncorrect)

            if (this.requireEmailVerification) {
                const email = user.user_em
                if (typeof email !== 'string' || email.trim().length === 0) {
                    return (res as any)
                        .status(this.clientErrors.emailRequired.code)
                        .send(this.clientErrors.emailRequired)
                }
                if (!user.email_verified_at) {
                    return (res as any)
                        .status(this.clientErrors.emailNotVerified.code)
                        .send(this.clientErrors.emailNotVerified)
                }
            }

            // Optional: 2-step login only when device is new
            if (this.login2StepNewDevice) {
                const email = user.user_em
                if (typeof email !== 'string' || email.trim().length === 0) {
                    return (res as any)
                        .status(this.clientErrors.emailRequired.code)
                        .send(this.clientErrors.emailRequired)
                }

                const deviceToken = getCookie(req as any, this.deviceCookieName)
                const deviceTokenHash = deviceToken ? sha256Hex(deviceToken) : null

                if (deviceTokenHash) {
                    const d = await db.exe('security', 'getActiveUserDeviceByUserAndTokenHash', [
                        user.user_id,
                        deviceTokenHash,
                    ])
                    if (d?.rows?.length > 0) {
                        // Known device: best-effort touch
                        try {
                            await db.exe('security', 'touchUserDevice', [
                                user.user_id,
                                deviceTokenHash,
                                (req as any).get?.('User-Agent') ?? null,
                                (req as any).ip ?? null,
                            ])
                        } catch {}
                    } else {
                        return await this._startLoginChallenge(req, res, user)
                    }
                } else {
                    return await this._startLoginChallenge(req, res, user)
                }
            }

            ;(req as any).session.user_id = user.user_id
            ;(req as any).session.user_na = user.user_na
            ;(req as any).session.profile_id = user.profile_id

            // Best-effort audit/logging fields (do not fail login if this fails)
            try {
                await db.exe('security', 'updateUserLastLogin', [user.user_id])
            } catch {}
            await auditBestEffort(
                req,
                {
                    action: 'login',
                    user_id: user.user_id,
                    profile_id: user.profile_id,
                    details: { user_na: user.user_na },
                },
                this.ctx
            )

            return (res as any).status(this.successMsgs.login.code).send(this.successMsgs.login)
        } catch (err: any) {
            const status = this.clientErrors.unknown.code
            try {
                ;(res as any).locals.__errorLogged = true
            } catch {}
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Session.createSession: ${redactSecretsInString(
                    err?.message || err
                )}`,
                ctx: {
                    requestId: (req as any).requestId,
                    method: (req as any).method,
                    path: (req as any).originalUrl,
                    status,
                    user_id: (req as any).session?.user_id,
                    profile_id: (req as any).session?.profile_id,
                    durationMs:
                        typeof (req as any).requestStartMs === 'number'
                            ? Date.now() - (req as any).requestStartMs
                            : undefined,
                },
            })
            ;(res as any).status(status).send(this.clientErrors.unknown)
        }
    }

    async _startLoginChallenge(req: AppRequest, res: AppResponse, user: any) {
        const token = randomBytes(32).toString('hex')
        const code = String(Math.floor(100000 + Math.random() * 900000))
        const tokenHash = sha256Hex(token)
        const codeHash = sha256Hex(code)

        await db.exe('security', 'insertLoginChallenge', [
            user.user_id,
            tokenHash,
            codeHash,
            String(this.loginChallengeExpiresSeconds),
            (req as any).ip ?? null,
            (req as any).get?.('User-Agent') ?? null,
        ])

        await this.email.sendLoginChallenge({
            to: user.user_em,
            token,
            code,
            appName: (config as any)?.app?.name,
        })

        await auditBestEffort(
            req,
            {
                action: 'login_challenge_sent',
                user_id: user.user_id,
                profile_id: user.profile_id,
                details: { sentTo: this.email.maskEmail(user.user_em) },
            },
            this.ctx
        )

        return (res as any).status(this.successMsgs.loginVerificationRequired.code).send({
            ...this.successMsgs.loginVerificationRequired,
            challengeToken: token,
            sentTo: this.email.maskEmail(user.user_em),
        })
    }

    async verifyLoginChallenge(req: AppRequest, res: AppResponse) {
        try {
            if (this.sessionExists(req)) {
                return (res as any)
                    .status(this.clientErrors.sessionExists.code)
                    .send(this.clientErrors.sessionExists)
            }

            const token = (req as any).body?.token
            const code = (req as any).body?.code
            if (typeof token !== 'string' || typeof code !== 'string') {
                return (res as any)
                    .status(this.clientErrors.invalidParameters.code)
                    .send(this.clientErrors.invalidParameters)
            }

            const tokenHash = sha256Hex(token)
            const r = await db.exe('security', 'getLoginChallengeByTokenHash', [tokenHash])
            const row = r?.rows?.[0]
            if (!row) {
                return (res as any)
                    .status(this.clientErrors.invalidToken.code)
                    .send(this.clientErrors.invalidToken)
            }

            if (row.verified_at) {
                return (res as any)
                    .status(this.clientErrors.invalidToken.code)
                    .send(this.clientErrors.invalidToken)
            }

            const expiresAt = row.expires_at ? new Date(row.expires_at) : null
            if (
                !expiresAt ||
                Number.isNaN(expiresAt.getTime()) ||
                expiresAt.getTime() <= Date.now()
            ) {
                return (res as any)
                    .status(this.clientErrors.expiredToken.code)
                    .send(this.clientErrors.expiredToken)
            }

            const attempts = Number(row.attempt_count ?? 0)
            if (
                Number.isFinite(this.loginChallengeMaxAttempts) &&
                attempts >= this.loginChallengeMaxAttempts
            ) {
                return (res as any)
                    .status(this.clientErrors.tooManyRequests.code)
                    .send(this.clientErrors.tooManyRequests)
            }

            const codeHash = sha256Hex(code)
            if (codeHash !== row.code_hash) {
                try {
                    await db.exe('security', 'incrementLoginChallengeAttempt', [row.challenge_id])
                } catch {}
                return (res as any)
                    .status(this.clientErrors.invalidToken.code)
                    .send(this.clientErrors.invalidToken)
            }

            await db.exe('security', 'markLoginChallengeVerified', [row.challenge_id])

            if (this.requireEmailVerification && !row.email_verified_at) {
                return (res as any)
                    .status(this.clientErrors.emailNotVerified.code)
                    .send(this.clientErrors.emailNotVerified)
            }

            // Trust this device by issuing a device token cookie
            const deviceToken = randomBytes(32).toString('hex')
            const deviceTokenHash = sha256Hex(deviceToken)
            try {
                await db.exe('security', 'upsertUserDevice', [
                    row.user_id,
                    deviceTokenHash,
                    (req as any).get?.('User-Agent') ?? null,
                    (req as any).ip ?? null,
                ])
            } catch {}

            ;(res as any).cookie(this.deviceCookieName, deviceToken, {
                httpOnly: true,
                sameSite: (config as any)?.session?.cookie?.sameSite ?? 'lax',
                secure: Boolean((config as any)?.session?.cookie?.secure),
                maxAge: Number.isFinite(this.deviceCookieMaxAgeMs)
                    ? this.deviceCookieMaxAgeMs
                    : undefined,
            })
            ;(req as any).session.user_id = row.user_id
            ;(req as any).session.user_na = row.user_na
            ;(req as any).session.profile_id = row.profile_id

            try {
                await db.exe('security', 'updateUserLastLogin', [row.user_id])
            } catch {}
            await auditBestEffort(
                req,
                {
                    action: 'login',
                    user_id: row.user_id,
                    profile_id: row.profile_id,
                    details: { user_na: row.user_na, twoStep: true },
                },
                this.ctx
            )

            return (res as any).status(this.successMsgs.login.code).send(this.successMsgs.login)
        } catch (err: any) {
            const status = this.clientErrors.unknown.code
            try {
                ;(res as any).locals.__errorLogged = true
            } catch {}
            log.show({
                type: log.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Session.verifyLoginChallenge: ${redactSecretsInString(
                    err?.message || err
                )}`,
                ctx: {
                    requestId: (req as any).requestId,
                    method: (req as any).method,
                    path: (req as any).originalUrl,
                    status,
                    user_id: (req as any).session?.user_id,
                    profile_id: (req as any).session?.profile_id,
                    durationMs:
                        typeof (req as any).requestStartMs === 'number'
                            ? Date.now() - (req as any).requestStartMs
                            : undefined,
                },
            })
            return (res as any).status(status).send(this.clientErrors.unknown)
        }
    }

    destroySession(req: AppRequest) {
        ;(req as any).session.destroy()
    }
}
