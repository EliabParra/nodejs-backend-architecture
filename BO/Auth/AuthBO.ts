import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'

import { AuthErrorHandler } from './errors/AuthErrorHandler.js'
import { AuthValidate } from './AuthValidate.js'
import { AuthRepository } from './Auth.js'
import EmailService from '../../src/BSS/EmailService.js'
import { errorMessage } from '../../src/helpers/error.js'

type ApiResponse = {
    code: number
    msg: string
    alerts?: string[]
    data?: Record<string, unknown> | null
}

const successMsgs = require('./authSuccessMsgs.json')[config.app.lang] as Record<string, string>
const email = new EmailService()

function sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isEmail(value: string): boolean {
    return value.includes('@')
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (value == null) return null
    if (typeof value !== 'object') return null
    return value as Record<string, unknown>
}

function getString(
    obj: Record<string, unknown> | null | undefined,
    key: string
): string | undefined {
    const value = obj?.[key]
    return typeof value === 'string' ? value : undefined
}

function getNumber(
    obj: Record<string, unknown> | null | undefined,
    key: string
): number | undefined {
    const value = obj?.[key]
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
        const num = Number(value)
        return Number.isFinite(num) ? num : undefined
    }
    return undefined
}

function parseJsonMeta(
    value: string | Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
    if (value == null) return null
    if (typeof value === 'object') return value
    if (typeof value !== 'string') return null
    try {
        const parsed = JSON.parse(value) as unknown
        return asRecord(parsed)
    } catch {
        return null
    }
}

function getRequestContext(params: Record<string, unknown> | null | undefined): {
    ip: string | null
    userAgent: string | null
} {
    const req = asRecord(params?.['_request'])
    return {
        ip: getString(req, 'ip') ?? null,
        userAgent: getString(req, 'userAgent') ?? null,
    }
}

export class AuthBO {
    async register(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
        try {
            const emailAddr = getString(params, 'email')
            const username = getString(params, 'username')
            const password = getString(params, 'password')

            if (
                !AuthValidate.validateEmail(emailAddr) ||
                !AuthValidate.validateUsername(username) ||
                !AuthValidate.validatePassword(password, { min: 8, max: 200 })
            ) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            const emailNorm = String(emailAddr).trim().toLowerCase()
            const usernameNorm = String(username).trim()

            // Uniqueness checks (avoid leaking whether it was email or username)
            const existingByEmail = await AuthRepository.getUserBaseByEmail(emailNorm)
            const existingByUsername = await AuthRepository.getUserBaseByUsername(usernameNorm)
            if (existingByEmail || existingByUsername) {
                return AuthErrorHandler.alreadyRegistered()
            }

            const profileId = Number(config?.auth?.sessionProfileId ?? 1)
            if (!Number.isInteger(profileId) || profileId <= 0) {
                throw new Error('Invalid auth.sessionProfileId')
            }

            const hash = await bcrypt.hash(String(password), 10)
            const ins = await AuthRepository.insertUser({
                username: usernameNorm,
                email: emailNorm,
                passwordHash: hash,
            })
            const userId = ins?.user_id
            if (!userId) throw new Error('Failed to create user')

            await AuthRepository.upsertUserProfile({ userId, profileId })

            // Send email verification
            const expiresSeconds = Number(config?.auth?.emailVerificationExpiresSeconds ?? 900)
            const maxAttempts = Number(config?.auth?.emailVerificationMaxAttempts ?? 5)
            const purpose = String(config?.auth?.emailVerificationPurpose ?? 'email_verification')

            try {
                await AuthRepository.consumeOneTimeCodesForUserPurpose({ userId, purpose })
            } catch {}

            const token = randomBytes(32).toString('hex')
            const code = String(Math.floor(100000 + Math.random() * 900000))
            const tokenHash = sha256Hex(token)
            const codeHash = sha256Hex(code)

            const { ip: requestIp, userAgent: requestUserAgent } = getRequestContext(params)

            await AuthRepository.insertOneTimeCode({
                userId,
                purpose,
                codeHash,
                expiresSeconds,
                meta: {
                    tokenHash,
                    maxAttempts,
                    request: { ip: requestIp, userAgent: requestUserAgent },
                },
            })

            await email.sendEmailVerification({
                to: emailNorm,
                token,
                code,
                appName: config?.app?.name,
            })

            return { code: 201, msg: successMsgs.register ?? 'OK' }
        } catch (err: unknown) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.register: ' +
                    errorMessage(err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async requestEmailVerification(
        params: Record<string, unknown> | null | undefined
    ): Promise<ApiResponse> {
        try {
            const emailAddr = getString(params, 'email')
            if (!AuthValidate.validateEmail(emailAddr)) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            const emailNorm = String(emailAddr).trim().toLowerCase()
            const purpose = String(config?.auth?.emailVerificationPurpose ?? 'email_verification')

            // Avoid account enumeration: always return success.
            const user = await AuthRepository.getUserBaseByEmail(emailNorm)
            if (!user || user.email_verified_at) {
                return { code: 200, msg: successMsgs.requestEmailVerification ?? 'OK' }
            }

            const expiresSeconds = Number(config?.auth?.emailVerificationExpiresSeconds ?? 900)
            const maxAttempts = Number(config?.auth?.emailVerificationMaxAttempts ?? 5)

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

            const { ip: requestIp, userAgent: requestUserAgent } = getRequestContext(params)

            await AuthRepository.insertOneTimeCode({
                userId: user.user_id,
                purpose,
                codeHash,
                expiresSeconds,
                meta: {
                    tokenHash,
                    maxAttempts,
                    request: { ip: requestIp, userAgent: requestUserAgent },
                },
            })

            await email.sendEmailVerification({
                to: emailNorm,
                token,
                code,
                appName: config?.app?.name,
            })

            return { code: 200, msg: successMsgs.requestEmailVerification ?? 'OK' }
        } catch (err: unknown) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.requestEmailVerification: ' +
                    errorMessage(err),
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

            const purpose = String(config?.auth?.emailVerificationPurpose ?? 'email_verification')
            const tokenHash = sha256Hex(token)
            const codeHash = sha256Hex(code)

            const otp = await AuthRepository.getValidOneTimeCodeByTokenHash({
                purpose,
                tokenHash,
                codeHash,
            })

            if (!otp) {
                // Best-effort: increment attempts on the active otp for this token.
                try {
                    const active = await AuthRepository.getActiveOneTimeCodeByTokenHash({
                        purpose,
                        tokenHash,
                    })
                    if (active) {
                        const meta = parseJsonMeta(active.meta) ?? {}
                        const maxAttempts = Number(
                            meta?.maxAttempts ?? config?.auth?.emailVerificationMaxAttempts ?? 5
                        )
                        const attempts = Number(active.attempt_count ?? 0)
                        if (Number.isFinite(maxAttempts) && attempts >= maxAttempts) {
                            return AuthErrorHandler.tooManyRequests()
                        }
                        await AuthRepository.incrementOneTimeCodeAttempt(active.code_id)
                    }
                } catch {}

                return AuthErrorHandler.invalidToken()
            }

            const meta = parseJsonMeta(otp.meta) ?? {}
            const maxAttempts =
                getNumber(meta, 'maxAttempts') ??
                Number(config?.auth?.emailVerificationMaxAttempts ?? 5)
            const attempts = Number(otp.attempt_count ?? 0)
            if (Number.isFinite(maxAttempts) && attempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

            await AuthRepository.setUserEmailVerified(otp.user_id)
            try {
                await AuthRepository.consumeOneTimeCode(otp.code_id)
            } catch {}

            return { code: 200, msg: successMsgs.verifyEmail ?? 'OK' }
        } catch (err: unknown) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.verifyEmail: ' +
                    errorMessage(err),
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

            const { ip: requestIp, userAgent: requestUserAgent } = getRequestContext(params)

            // Avoid account enumeration: always return success.
            let user = null
            if (identifier && isEmail(identifier))
                user = await AuthRepository.getUserByEmail(identifier)
            else if (identifier) user = await AuthRepository.getUserByUsername(identifier)

            if (!user || !user.user_em) {
                return { code: 200, msg: successMsgs.requestPasswordReset ?? 'OK' }
            }

            const expiresSeconds = Number(config?.auth?.passwordResetExpiresSeconds ?? 900)
            const maxAttempts = Number(config?.auth?.passwordResetMaxAttempts ?? 5)
            const purpose = String(config?.auth?.passwordResetPurpose ?? 'password_reset')

            // Ensure only one active reset per user: invalidate older resets/codes.
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
                ip: requestIp,
                userAgent: requestUserAgent,
            })
            await AuthRepository.insertOneTimeCode({
                userId: user.user_id,
                purpose,
                codeHash,
                expiresSeconds,
                meta: {
                    tokenHash,
                    maxAttempts,
                    request: { ip: requestIp, userAgent: requestUserAgent },
                },
            })

            await email.sendPasswordReset({
                to: user.user_em,
                token,
                code,
                appName: config?.app?.name,
            })

            return { code: 200, msg: successMsgs.requestPasswordReset ?? 'OK' }
        } catch (err: unknown) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.requestPasswordReset: ' +
                    errorMessage(err),
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

            const purpose = String(config?.auth?.passwordResetPurpose ?? 'password_reset')
            const tokenHash = sha256Hex(token)
            const reset = await AuthRepository.getPasswordResetByTokenHash(tokenHash)
            if (!reset || reset.used_at) return AuthErrorHandler.invalidToken()

            const maxAttempts = Number(config?.auth?.passwordResetMaxAttempts ?? 5)
            const resetAttempts = Number(reset.attempt_count ?? 0)
            if (Number.isFinite(maxAttempts) && resetAttempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

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

            return { code: 200, msg: successMsgs.verifyPasswordReset ?? 'OK' }
        } catch (err: unknown) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.verifyPasswordReset: ' +
                    errorMessage(err),
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

            const purpose = String(config?.auth?.passwordResetPurpose ?? 'password_reset')
            const tokenHash = sha256Hex(token)
            const reset = await AuthRepository.getPasswordResetByTokenHash(tokenHash)
            if (!reset || reset.used_at) return AuthErrorHandler.invalidToken()

            const maxAttempts = Number(config?.auth?.passwordResetMaxAttempts ?? 5)
            const resetAttempts = Number(reset.attempt_count ?? 0)
            if (Number.isFinite(maxAttempts) && resetAttempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

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

            const hash = await bcrypt.hash(String(newPassword), 10)
            await AuthRepository.updateUserPassword({ userId: reset.user_id, passwordHash: hash })

            // Best effort: consume code + mark reset used.
            try {
                await AuthRepository.consumeOneTimeCode(otp.code_id)
            } catch {}
            try {
                await AuthRepository.markPasswordResetUsed(reset.reset_id)
            } catch {}

            // Best effort: invalidate all existing sessions for the user.
            try {
                await AuthRepository.deleteSessionsByUserId(reset.user_id)
            } catch {}

            return { code: 200, msg: successMsgs.resetPassword ?? 'OK' }
        } catch (err: unknown) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.resetPassword: ' +
                    errorMessage(err),
            })
            return AuthErrorHandler.unknownError()
        }
    }
}
