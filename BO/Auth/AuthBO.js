import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'

import { AuthErrorHandler } from './errors/AuthErrorHandler.js'
import { AuthValidate } from './AuthValidate.js'
import { AuthRepository } from './Auth.js'
import EmailService from '../../src/BSS/EmailService.js'

const successMsgs = require('./authSuccessMsgs.json')[config.app.lang]
const email = new EmailService()

function sha256Hex(value) {
    return createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function isEmail(value) {
    return typeof value === 'string' && value.includes('@')
}

function parseJsonMeta(value) {
    if (value == null) return null
    if (typeof value === 'object') return value
    if (typeof value !== 'string') return null
    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

export class AuthBO {
    async register(params) {
        try {
            const emailAddr = params?.email
            const username = params?.username
            const password = params?.password

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

            const requestIp = params?._request?.ip ?? null
            const requestUserAgent = params?._request?.userAgent ?? null

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
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.register: ' +
                    String(err?.message || err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async requestEmailVerification(params) {
        try {
            const emailAddr = params?.email
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

            const requestIp = params?._request?.ip ?? null
            const requestUserAgent = params?._request?.userAgent ?? null

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
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.requestEmailVerification: ' +
                    String(err?.message || err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async verifyEmail(params) {
        try {
            const token = params?.token
            const code = params?.code
            if (!AuthValidate.validateToken(token) || !AuthValidate.validateCode(code)) {
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
            const maxAttempts = Number(
                meta?.maxAttempts ?? config?.auth?.emailVerificationMaxAttempts ?? 5
            )
            const attempts = Number(otp.attempt_count ?? 0)
            if (Number.isFinite(maxAttempts) && attempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

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
                    String(err?.message || err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async requestPasswordReset(params) {
        try {
            const identifier = params?.identifier
            if (!AuthValidate.validateIdentifier(identifier)) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            const requestIp = params?._request?.ip ?? null
            const requestUserAgent = params?._request?.userAgent ?? null

            // Avoid account enumeration: always return success.
            let user = null
            if (isEmail(identifier)) user = await AuthRepository.getUserByEmail(identifier)
            else user = await AuthRepository.getUserByUsername(identifier)

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
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.requestPasswordReset: ' +
                    String(err?.message || err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async verifyPasswordReset(params) {
        try {
            const token = params?.token
            const code = params?.code
            if (!AuthValidate.validateToken(token) || !AuthValidate.validateCode(code)) {
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
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.verifyPasswordReset: ' +
                    String(err?.message || err),
            })
            return AuthErrorHandler.unknownError()
        }
    }

    async resetPassword(params) {
        try {
            const token = params?.token
            const code = params?.code
            const newPassword = params?.newPassword

            if (
                !AuthValidate.validateToken(token) ||
                !AuthValidate.validateCode(code) ||
                !AuthValidate.validateNewPassword(newPassword, { min: 8, max: 200 })
            ) {
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
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', AuthBO.resetPassword: ' +
                    String(err?.message || err),
            })
            return AuthErrorHandler.unknownError()
        }
    }
}
