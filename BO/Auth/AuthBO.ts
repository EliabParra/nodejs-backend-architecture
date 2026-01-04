import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

import EmailService from '../../src/BSS/EmailService.js'
import { AuthErrorHandler } from './AuthErrorHandler.js'
import { AuthValidate } from './AuthValidate.js'
import { AuthRepository } from './Auth.js'

const require = createRequire(import.meta.url)

type ApiResponse = {
    code: number
    msg: string
    data?: Record<string, unknown> | null
    alerts?: string[]
}

const successMsgs = require('./messages/authSuccessMsgs.json')[config.app.lang] as Record<
    string,
    string
>

const email = new EmailService()

function sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isEmail(value: string): boolean {
    return value.includes('@')
}

function getString(
    obj: Record<string, unknown> | null | undefined,
    key: string
): string | undefined {
    const v = obj?.[key]
    return typeof v === 'string' ? v : undefined
}

type RequestCtx = { ip: string | null; userAgent: string | null }

function getRequestCtx(params: Record<string, unknown> | null | undefined): RequestCtx {
    const req = (params && typeof params === 'object' ? (params as any)._request : null) as any
    const ip = typeof req?.ip === 'string' && req.ip.trim().length > 0 ? req.ip.trim() : null
    const userAgent =
        typeof req?.userAgent === 'string' && req.userAgent.trim().length > 0
            ? req.userAgent.trim()
            : null
    return { ip, userAgent }
}

function safeIpForDb(ip: string | null): string {
    // Some DB schemas use inet; ensure we always pass a non-empty value.
    return ip && ip.trim().length > 0 ? ip.trim() : '0.0.0.0'
}

function errorText(err: unknown): string {
    if (err instanceof Error) return err.message
    return String(err)
}

async function invalidateUserSessionsBestEffort(userId: number) {
    try {
        const schema = String((config as any)?.session?.store?.schemaName ?? 'public')
        const table = String((config as any)?.session?.store?.tableName ?? 'session')
        const qualified = schema === 'public' ? 'public.' + table : schema + '.' + table

        // connect-pg-simple session table uses sess as JSON.
        await (db as any).exeRaw?.('delete from ' + qualified + " where (sess->>'user_id') = $1", [
            String(userId),
        ])
    } catch {
        // best effort
    }
}

export class AuthBO {
    async register(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
        try {
            const username = getString(params, 'username')
            const emailValue = getString(params, 'email')
            const password = getString(params, 'password')

            const loginId = String((config as any)?.auth?.loginId ?? 'email')
                .trim()
                .toLowerCase()
            const requireEmailVerification = Boolean(
                (config as any)?.auth?.requireEmailVerification
            )

            // Minimal requirements: if loginId=email OR email verification is enabled -> require email.
            if ((loginId === 'email' || requireEmailVerification) && !emailValue) {
                return AuthErrorHandler.emailRequired()
            }

            if (
                !AuthValidate.validateUsername(username) ||
                (emailValue != null && !AuthValidate.validateEmail(emailValue)) ||
                !AuthValidate.validatePassword(password, { min: 8, max: 200 })
            ) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            // Duplicate checks
            if (emailValue) {
                const existingByEmail = await AuthRepository.getUserBaseByEmail(emailValue)
                if (existingByEmail) return AuthErrorHandler.alreadyRegistered()
            }
            if (username) {
                const existingByUsername = await AuthRepository.getUserBaseByUsername(username)
                if (existingByUsername) return AuthErrorHandler.alreadyRegistered()
            }

            const hash = await bcrypt.hash(String(password), 10)
            const inserted = await AuthRepository.insertUser({
                username: username ?? null,
                email: emailValue ?? null,
                passwordHash: hash,
            })

            const sessionProfileIdRaw = Number((config as any)?.auth?.sessionProfileId ?? 1)
            const sessionProfileId =
                Number.isFinite(sessionProfileIdRaw) && sessionProfileIdRaw > 0
                    ? sessionProfileIdRaw
                    : 1
            await AuthRepository.upsertUserProfile({
                userId: inserted.user_id,
                profileId: sessionProfileId,
            })

            // Optional email verification: send link+code.
            if (requireEmailVerification && emailValue) {
                try {
                    // Invalidate any active codes for that user/purpose.
                    const purpose = String(
                        (config as any)?.auth?.emailVerificationPurpose ?? 'email_verification'
                    )
                    await AuthRepository.consumeOneTimeCodesForUserPurpose({
                        userId: inserted.user_id,
                        purpose,
                    })

                    const expiresSeconds = Number(
                        (config as any)?.auth?.emailVerificationExpiresSeconds ?? 900
                    )
                    const maxAttempts = Number(
                        (config as any)?.auth?.emailVerificationMaxAttempts ?? 5
                    )

                    const token = randomBytes(32).toString('hex')
                    const code = String(Math.floor(100000 + Math.random() * 900000))
                    const tokenHash = sha256Hex(token)
                    const codeHash = sha256Hex(code)

                    await AuthRepository.insertOneTimeCode({
                        userId: inserted.user_id,
                        purpose,
                        codeHash,
                        expiresSeconds,
                        meta: { tokenHash, maxAttempts },
                    })

                    await email.sendEmailVerification({
                        to: emailValue,
                        token,
                        code,
                        appName: (config as any)?.app?.name,
                    })
                } catch {
                    // best effort
                }
            }

            return { code: 201, msg: successMsgs.register ?? 'OK' }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.register: ' +
                    errorText(err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async requestEmailVerification(
        params: Record<string, unknown> | null | undefined
    ): Promise<ApiResponse> {
        try {
            const identifier = getString(params, 'identifier')
            if (!AuthValidate.validateIdentifier(identifier)) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            // Avoid account enumeration: always return success.
            let user = null
            if (identifier && isEmail(identifier))
                user = await AuthRepository.getUserByEmail(identifier)
            else if (identifier) user = await AuthRepository.getUserByUsername(identifier)

            if (!user || !user.user_em) {
                return { code: 200, msg: successMsgs.requestEmailVerification ?? 'OK' }
            }

            const purpose = String(
                (config as any)?.auth?.emailVerificationPurpose ?? 'email_verification'
            )
            const expiresSeconds = Number(
                (config as any)?.auth?.emailVerificationExpiresSeconds ?? 900
            )
            const maxAttempts = Number((config as any)?.auth?.emailVerificationMaxAttempts ?? 5)

            // Invalidate any active codes for this user/purpose.
            await AuthRepository.consumeOneTimeCodesForUserPurpose({
                userId: user.user_id,
                purpose,
            })

            const token = randomBytes(32).toString('hex')
            const code = String(Math.floor(100000 + Math.random() * 900000))
            const tokenHash = sha256Hex(token)
            const codeHash = sha256Hex(code)

            await AuthRepository.insertOneTimeCode({
                userId: user.user_id,
                purpose,
                codeHash,
                expiresSeconds,
                meta: { tokenHash, maxAttempts },
            })

            await email.sendEmailVerification({
                to: user.user_em,
                token,
                code,
                appName: (config as any)?.app?.name,
            })

            return { code: 200, msg: successMsgs.requestEmailVerification ?? 'OK' }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.requestEmailVerification: ' +
                    errorText(err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async verifyEmail(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
        try {
            const token = getString(params, 'token')
            const code = getString(params, 'code')
            if (!AuthValidate.validateToken(token) || !AuthValidate.validateCode(code)) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }
            if (!token || !code) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            const purpose = String(
                (config as any)?.auth?.emailVerificationPurpose ?? 'email_verification'
            )
            const tokenHash = sha256Hex(token)
            const codeHash = sha256Hex(code)

            const otp = await AuthRepository.getValidOneTimeCodeForPurposeAndTokenHash({
                purpose,
                tokenHash,
                codeHash,
            })
            if (!otp) {
                // If there's an active (non-consumed) token but it's expired, return a clearer message.
                // Note: code mismatch and "not found" still map to invalidToken.
                const active = await AuthRepository.getActiveOneTimeCodeForPurposeAndTokenHash({
                    purpose,
                    tokenHash,
                })
                if (active?.expires_at) {
                    const expiresAt = new Date(active.expires_at)
                    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
                        return AuthErrorHandler.expiredToken()
                    }
                }
                return AuthErrorHandler.invalidToken()
            }

            const attempts = Number(otp.attempt_count ?? 0)
            const maxAttempts = Number((config as any)?.auth?.emailVerificationMaxAttempts ?? 5)
            if (Number.isFinite(maxAttempts) && attempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

            // Mark verified, consume the code.
            await AuthRepository.setUserEmailVerified(otp.user_id)
            try {
                await AuthRepository.consumeOneTimeCode(otp.code_id)
            } catch {}

            return { code: 200, msg: successMsgs.verifyEmail ?? 'OK' }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.verifyEmail: ' +
                    errorText(err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async requestPasswordReset(
        params: Record<string, unknown> | null | undefined
    ): Promise<ApiResponse> {
        try {
            const identifier = getString(params, 'identifier')
            if (!AuthValidate.validateIdentifier(identifier)) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            // Avoid account enumeration: always return success.
            let user = null
            if (identifier && isEmail(identifier))
                user = await AuthRepository.getUserByEmail(identifier)
            else if (identifier) user = await AuthRepository.getUserByUsername(identifier)

            if (!user || !user.user_em) {
                return { code: 200, msg: successMsgs.requestPasswordReset ?? 'OK' }
            }

            const ctx = getRequestCtx(params)

            const expiresSeconds = Number((config as any)?.auth?.passwordResetExpiresSeconds ?? 900)
            const maxAttempts = Number((config as any)?.auth?.passwordResetMaxAttempts ?? 5)
            const purpose = String((config as any)?.auth?.passwordResetPurpose ?? 'password_reset')

            // Single active reset per user: invalidate previous.
            try {
                await AuthRepository.invalidateActivePasswordResetsForUser(user.user_id)
            } catch {}
            try {
                await AuthRepository.consumeOneTimeCodesForUserPurpose({
                    userId: user.user_id,
                    purpose,
                })
            } catch {}

            const token = randomBytes(32).toString('hex')
            const code = String(Math.floor(100000 + Math.random() * 900000))
            const tokenHash = sha256Hex(token)
            const codeHash = sha256Hex(code)

            await AuthRepository.insertPasswordReset({
                userId: user.user_id,
                tokenHash,
                sentTo: user.user_em,
                expiresSeconds,
                ip: safeIpForDb(ctx.ip),
                userAgent: ctx.userAgent,
            })
            await AuthRepository.insertOneTimeCode({
                userId: user.user_id,
                purpose,
                codeHash,
                expiresSeconds,
                meta: {
                    tokenHash,
                    maxAttempts,
                    request: { ip: safeIpForDb(ctx.ip), userAgent: ctx.userAgent },
                },
            })

            await email.sendPasswordReset({
                to: user.user_em,
                token,
                code,
                appName: (config as any)?.app?.name,
            })

            return { code: 200, msg: successMsgs.requestPasswordReset ?? 'OK' }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.requestPasswordReset: ' +
                    errorText(err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async verifyPasswordReset(
        params: Record<string, unknown> | null | undefined
    ): Promise<ApiResponse> {
        try {
            const token = getString(params, 'token')
            const code = getString(params, 'code')
            if (!AuthValidate.validateToken(token) || !AuthValidate.validateCode(code)) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }
            if (!token || !code) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            const purpose = String((config as any)?.auth?.passwordResetPurpose ?? 'password_reset')
            const tokenHash = sha256Hex(token)
            const reset = await AuthRepository.getPasswordResetByTokenHash(tokenHash)
            if (!reset || reset.used_at) return AuthErrorHandler.invalidToken()

            const expiresAt = reset.expires_at ? new Date(reset.expires_at) : null
            if (
                !expiresAt ||
                Number.isNaN(expiresAt.getTime()) ||
                expiresAt.getTime() <= Date.now()
            ) {
                return AuthErrorHandler.expiredToken()
            }

            const codeHash = sha256Hex(code)
            const otp = await AuthRepository.getValidOneTimeCode({
                userId: reset.user_id,
                purpose,
                codeHash,
            })
            if (!otp) {
                try {
                    await AuthRepository.incrementPasswordResetAttempt(reset.reset_id)
                } catch {}
                return AuthErrorHandler.invalidToken()
            }

            const attempts = Number(otp.attempt_count ?? 0)
            const maxAttempts = Number((config as any)?.auth?.passwordResetMaxAttempts ?? 5)
            if (Number.isFinite(maxAttempts) && attempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

            return { code: 200, msg: successMsgs.verifyPasswordReset ?? 'OK' }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.verifyPasswordReset: ' +
                    errorText(err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async resetPassword(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
        try {
            const token = getString(params, 'token')
            const code = getString(params, 'code')
            const newPassword = getString(params, 'newPassword')

            if (
                !AuthValidate.validateToken(token) ||
                !AuthValidate.validateCode(code) ||
                !AuthValidate.validateNewPassword(newPassword, { min: 8, max: 200 })
            ) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }
            if (!token || !code) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            const purpose = String((config as any)?.auth?.passwordResetPurpose ?? 'password_reset')
            const tokenHash = sha256Hex(token)
            const reset = await AuthRepository.getPasswordResetByTokenHash(tokenHash)
            if (!reset || reset.used_at) return AuthErrorHandler.invalidToken()

            const expiresAt = reset.expires_at ? new Date(reset.expires_at) : null
            if (
                !expiresAt ||
                Number.isNaN(expiresAt.getTime()) ||
                expiresAt.getTime() <= Date.now()
            ) {
                return AuthErrorHandler.expiredToken()
            }

            const codeHash = sha256Hex(code)
            const otp = await AuthRepository.getValidOneTimeCode({
                userId: reset.user_id,
                purpose,
                codeHash,
            })
            if (!otp) {
                try {
                    await AuthRepository.incrementPasswordResetAttempt(reset.reset_id)
                } catch {}
                return AuthErrorHandler.invalidToken()
            }

            const attempts = Number(otp.attempt_count ?? 0)
            const maxAttempts = Number((config as any)?.auth?.passwordResetMaxAttempts ?? 5)
            if (Number.isFinite(maxAttempts) && attempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

            const hash = await bcrypt.hash(String(newPassword), 10)
            await AuthRepository.updateUserPassword({ userId: reset.user_id, passwordHash: hash })

            // Best effort: consume code + mark reset used.
            try {
                await AuthRepository.consumeOneTimeCode(otp.code_id)
            } catch {}
            try {
                await AuthRepository.markPasswordResetUsed(reset.reset_id)
            } catch {}

            // Best effort: invalidate existing sessions after password reset.
            await invalidateUserSessionsBestEffort(reset.user_id)

            return { code: 200, msg: successMsgs.resetPassword ?? 'OK' }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.resetPassword: ' +
                    errorText(err),
            })
            return AuthErrorHandler.unknownError()
        }
    }
}
