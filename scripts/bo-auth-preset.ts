import path from 'node:path'

export function authMethods() {
    return [
        'register',
        'requestEmailVerification',
        'verifyEmail',
        'requestPasswordReset',
        'verifyPasswordReset',
        'resetPassword',
    ]
}

export function templateAuthSuccessMsgs() {
    return (
        JSON.stringify(
            {
                es: {
                    register: 'Registrado',
                    requestEmailVerification:
                        'Si existe una cuenta, enviaremos un email de verificación',
                    verifyEmail: 'Email verificado',
                    requestPasswordReset: 'Si existe una cuenta, enviaremos instrucciones al email',
                    verifyPasswordReset: 'Verificación correcta',
                    resetPassword: 'Contraseña actualizada',
                },
                en: {
                    register: 'Registered',
                    requestEmailVerification:
                        'If an account exists, we will email a verification link',
                    verifyEmail: 'Email verified',
                    requestPasswordReset: 'If an account exists, we will email instructions',
                    verifyPasswordReset: 'Verification ok',
                    resetPassword: 'Password updated',
                },
            },
            null,
            2
        ) + '\n'
    )
}

export function templateAuthErrorMsgs() {
    return (
        JSON.stringify(
            {
                es: {
                    invalidParameters: { msg: 'Parámetros inválidos', code: 400 },
                    alreadyRegistered: { msg: 'Ya existe una cuenta', code: 409 },
                    emailRequired: { msg: 'Email requerido', code: 409 },
                    emailNotVerified: { msg: 'Email no verificado', code: 403 },
                    invalidToken: { msg: 'Token inválido', code: 401 },
                    expiredToken: { msg: 'Token expirado', code: 401 },
                    tooManyRequests: { msg: 'Demasiados intentos, inténtalo más tarde', code: 429 },
                    unknownError: { msg: 'Error desconocido', code: 500 },
                },
                en: {
                    invalidParameters: { msg: 'Invalid parameters', code: 400 },
                    alreadyRegistered: { msg: 'Account already exists', code: 409 },
                    emailRequired: { msg: 'Email required', code: 409 },
                    emailNotVerified: { msg: 'Email not verified', code: 403 },
                    invalidToken: { msg: 'Invalid token', code: 401 },
                    expiredToken: { msg: 'Expired token', code: 401 },
                    tooManyRequests: { msg: 'Too many attempts, try later', code: 429 },
                    unknownError: { msg: 'Unknown error', code: 500 },
                },
            },
            null,
            2
        ) + '\n'
    )
}

export function templateAuthAlertsLabels() {
    return (
        JSON.stringify(
            {
                es: {
                    labels: {
                        identifier: 'El email o usuario',
                        email: 'El email',
                        username: 'El usuario',
                        password: 'La contraseña',
                        token: 'El token',
                        code: 'El código',
                        newPassword: 'La nueva contraseña',
                    },
                },
                en: {
                    labels: {
                        identifier: 'Email or username',
                        email: 'Email',
                        username: 'Username',
                        password: 'Password',
                        token: 'Token',
                        code: 'Code',
                        newPassword: 'New password',
                    },
                },
            },
            null,
            2
        ) + '\n'
    )
}

export function templateAuthErrorHandler() {
    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

type ApiError = { code: number; msg: string; alerts?: string[] }
type AuthErrorKey =
    | 'invalidParameters'
    | 'invalidToken'
    | 'expiredToken'
    | 'tooManyRequests'
    | 'alreadyRegistered'
    | 'emailRequired'
    | 'emailNotVerified'
    | 'unknownError'

const errorMsgs = require('./messages/authErrorMsgs.json')[config.app.lang] as Record<AuthErrorKey, ApiError>

export class AuthErrorHandler {
    static invalidParameters(alerts?: string[]): ApiError {
        const { code, msg } = errorMsgs.invalidParameters
        return { code, msg, alerts: alerts ?? [] }
    }

    static invalidToken(): ApiError { return errorMsgs.invalidToken }
    static expiredToken(): ApiError { return errorMsgs.expiredToken }
    static tooManyRequests(): ApiError { return errorMsgs.tooManyRequests }

    static alreadyRegistered(): ApiError { return errorMsgs.alreadyRegistered }
    static emailRequired(): ApiError { return errorMsgs.emailRequired }
    static emailNotVerified(): ApiError { return errorMsgs.emailNotVerified }
    static unknownError(): ApiError { return errorMsgs.unknownError }
}
`
}

export function templateAuthValidate() {
    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
type AuthLabels = {
    identifier: string
    email: string
    username: string
    password: string
    token: string
    code: string
    newPassword: string
}

const labels = require('./messages/authAlerts.json')[config.app.lang].labels as AuthLabels

export class AuthValidate {
    static normalizeText(value: string | null | undefined): string | undefined {
        if (typeof value !== 'string') return undefined
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
    }

    static validateIdentifier(value: string | null | undefined): boolean {
        const id = this.normalizeText(value)
        if (!id) return v.validateString({ value: id, label: labels.identifier })
        return v.validateLength({ value: id, label: labels.identifier }, 3, 320)
    }

    static validateEmail(value: string | null | undefined): boolean {
        const email = this.normalizeText(value)
        if (!email) return v.validateString({ value: email, label: labels.email })
        return v.validateEmail({ value: email, label: labels.email })
    }

    static validateUsername(value: string | null | undefined): boolean {
        const username = this.normalizeText(value)
        if (!username) return v.validateString({ value: username, label: labels.username })
        return v.validateLength({ value: username, label: labels.username }, 3, 80)
    }

    static validatePassword(value: string | null | undefined, { min = 8, max = 200 }: { min?: number; max?: number } = {}): boolean {
        const pw = this.normalizeText(value)
        if (!pw) return v.validateString({ value: pw, label: labels.password })
        return v.validateLength({ value: pw, label: labels.password }, min, max)
    }

    static validateToken(value: string | null | undefined): boolean {
        const token = this.normalizeText(value)
        if (!token) return v.validateString({ value: token, label: labels.token })
        return v.validateLength({ value: token, label: labels.token }, 16, 256)
    }

    static validateCode(value: string | null | undefined): boolean {
        const code = this.normalizeText(value)
        if (!code) return v.validateString({ value: code, label: labels.code })
        return v.validateLength({ value: code, label: labels.code }, 4, 12)
    }

    static validateNewPassword(value: string | null | undefined, { min = 8, max = 200 }: { min?: number; max?: number } = {}): boolean {
        const pw = this.normalizeText(value)
        if (!pw) return v.validateString({ value: pw, label: labels.newPassword })
        return v.validateLength({ value: pw, label: labels.newPassword }, min, max)
    }
}
`
}

export function templateAuthRepo() {
    return `/*
Auth Repository

- DB access helpers used by AuthBO.
- Must align with query names in src/config/queries.json.
*/

export type UserRow = {
    user_id: number
    user_na?: string | null
    user_em?: string | null
    email_verified_at?: string | Date | null
    user_pw?: string | null
    profile_id?: number | null
}

export type UserBaseRow = {
    user_id: number
    user_na?: string | null
    user_em?: string | null
    email_verified_at?: string | Date | null
}

export type PasswordResetRow = {
    reset_id: number
    user_id: number
    expires_at?: string | Date | null
    used_at?: string | Date | null
    attempt_count?: number | null
}

export type OneTimeCodeRow = {
    code_id: number
    user_id: number
    purpose?: string | null
    expires_at?: string | Date | null
    consumed_at?: string | Date | null
    attempt_count?: number | null
    meta?: any
}

export class AuthRepository {
    // --- Users
    static async getUserByEmail(email: string): Promise<UserRow | null> {
        const r = (await db.exe('security', 'getUserByEmail', [email])) as { rows?: UserRow[] }
        return r.rows?.[0] ?? null
    }

    static async getUserByUsername(username: string): Promise<UserRow | null> {
        const r = (await db.exe('security', 'getUserByUsername', [username])) as {
            rows?: UserRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async getUserBaseByEmail(email: string): Promise<UserBaseRow | null> {
        const r = (await db.exe('security', 'getUserBaseByEmail', [email])) as {
            rows?: UserBaseRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async getUserBaseByUsername(username: string): Promise<UserBaseRow | null> {
        const r = (await db.exe('security', 'getUserBaseByUsername', [username])) as {
            rows?: UserBaseRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async insertUser({
        username,
        email,
        passwordHash,
    }: {
        username: string | null
        email: string | null
        passwordHash: string
    }): Promise<{ user_id: number }> {
        const r = (await db.exe('security', 'insertUser', [username, email, passwordHash])) as {
            rows?: Array<{ user_id: number }>
        }
        const row = r.rows?.[0]
        if (!row?.user_id) throw new Error('insertUser did not return user_id')
        return row
    }

    static async upsertUserProfile({ userId, profileId }: { userId: number; profileId: number }) {
        await db.exe('security', 'upsertUserProfile', [userId, profileId])
        return true
    }

    static async setUserEmailVerified(userId: number) {
        await db.exe('security', 'setUserEmailVerified', [userId])
        return true
    }

    static async updateUserLastLogin(userId: number) {
        await db.exe('security', 'updateUserLastLogin', [userId])
        return true
    }

    // --- Password reset
    static async insertPasswordReset({
        userId,
        tokenHash,
        sentTo,
        expiresSeconds,
        ip,
        userAgent,
    }: {
        userId: number
        tokenHash: string
        sentTo: string
        expiresSeconds: number
        ip?: string | null
        userAgent?: string | null
    }): Promise<void> {
        await db.exe('security', 'insertPasswordReset', [
            userId,
            tokenHash,
            sentTo,
            String(expiresSeconds),
            ip ?? null,
            userAgent ?? null,
        ])
    }

    static async invalidateActivePasswordResetsForUser(userId: number): Promise<boolean> {
        await db.exe('security', 'invalidateActivePasswordResetsForUser', [userId])
        return true
    }

    static async getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRow | null> {
        const r = (await db.exe('security', 'getPasswordResetByTokenHash', [tokenHash])) as {
            rows?: PasswordResetRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async incrementPasswordResetAttempt(resetId: number): Promise<boolean> {
        await db.exe('security', 'incrementPasswordResetAttempt', [resetId])
        return true
    }

    static async markPasswordResetUsed(resetId: number): Promise<boolean> {
        await db.exe('security', 'markPasswordResetUsed', [resetId])
        return true
    }

    // --- One-time codes (email verification, password reset, etc)
    static async insertOneTimeCode({
        userId,
        purpose,
        codeHash,
        expiresSeconds,
        meta,
    }: {
        userId: number
        purpose: string
        codeHash: string
        expiresSeconds: number
        meta?: Record<string, unknown>
    }): Promise<boolean> {
        await db.exe('security', 'insertOneTimeCode', [
            userId,
            purpose,
            codeHash,
            String(expiresSeconds),
            JSON.stringify(meta ?? {}),
        ])
        return true
    }

    static async consumeOneTimeCodesForUserPurpose({ userId, purpose }: { userId: number; purpose: string }) {
        await db.exe('security', 'consumeOneTimeCodesForUserPurpose', [userId, purpose])
        return true
    }

    static async getValidOneTimeCode({
        userId,
        purpose,
        codeHash,
    }: {
        userId: number
        purpose: string
        codeHash: string
    }): Promise<OneTimeCodeRow | null> {
        const r = (await db.exe('security', 'getValidOneTimeCodeForPurpose', [
            userId,
            purpose,
            codeHash,
        ])) as { rows?: OneTimeCodeRow[] }
        return r.rows?.[0] ?? null
    }

    static async getValidOneTimeCodeForPurposeAndTokenHash({
        purpose,
        tokenHash,
        codeHash,
    }: {
        purpose: string
        tokenHash: string
        codeHash: string
    }): Promise<OneTimeCodeRow | null> {
        const r = (await db.exe('security', 'getValidOneTimeCodeForPurposeAndTokenHash', [
            purpose,
            tokenHash,
            codeHash,
        ])) as { rows?: OneTimeCodeRow[] }
        return r.rows?.[0] ?? null
    }

    static async getActiveOneTimeCodeForPurposeAndTokenHash({
        purpose,
        tokenHash,
    }: {
        purpose: string
        tokenHash: string
    }): Promise<OneTimeCodeRow | null> {
        const r = (await db.exe('security', 'getActiveOneTimeCodeForPurposeAndTokenHash', [
            purpose,
            tokenHash,
        ])) as { rows?: OneTimeCodeRow[] }
        return r.rows?.[0] ?? null
    }

    static async incrementOneTimeCodeAttempt(codeId: number): Promise<boolean> {
        await db.exe('security', 'incrementOneTimeCodeAttempt', [codeId])
        return true
    }

    static async consumeOneTimeCode(codeId: number): Promise<boolean> {
        await db.exe('security', 'consumeOneTimeCode', [codeId])
        return true
    }

    // --- Password
    static async updateUserPassword({ userId, passwordHash }: { userId: number; passwordHash: string }): Promise<boolean> {
        await db.exe('security', 'updateUserPassword', [userId, passwordHash])
        return true
    }
}
`
}

export function templateAuthBO() {
    // This template includes no ${} expansions and avoids nested template literals.
    const src = `import { createRequire } from 'node:module'
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

function getString(obj: Record<string, unknown> | null | undefined, key: string): string | undefined {
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
        await (db as any).exeRaw?.(
            "delete from " + qualified + " where (sess->>'user_id') = $1",
            [String(userId)]
        )
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
            const requireEmailVerification = Boolean((config as any)?.auth?.requireEmailVerification)

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
            await AuthRepository.upsertUserProfile({ userId: inserted.user_id, profileId: sessionProfileId })

            // Optional email verification: send link+code.
            if (requireEmailVerification && emailValue) {
                try {
                    // Invalidate any active codes for that user/purpose.
                    const purpose = String((config as any)?.auth?.emailVerificationPurpose ?? 'email_verification')
                    await AuthRepository.consumeOneTimeCodesForUserPurpose({ userId: inserted.user_id, purpose })

                    const expiresSeconds = Number((config as any)?.auth?.emailVerificationExpiresSeconds ?? 900)
                    const maxAttempts = Number((config as any)?.auth?.emailVerificationMaxAttempts ?? 5)

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

    async requestEmailVerification(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
        try {
            const identifier = getString(params, 'identifier')
            if (!AuthValidate.validateIdentifier(identifier)) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            // Avoid account enumeration: always return success.
            let user = null
            if (identifier && isEmail(identifier)) user = await AuthRepository.getUserByEmail(identifier)
            else if (identifier) user = await AuthRepository.getUserByUsername(identifier)

            if (!user || !user.user_em) {
                return { code: 200, msg: successMsgs.requestEmailVerification ?? 'OK' }
            }

            const purpose = String((config as any)?.auth?.emailVerificationPurpose ?? 'email_verification')
            const expiresSeconds = Number((config as any)?.auth?.emailVerificationExpiresSeconds ?? 900)
            const maxAttempts = Number((config as any)?.auth?.emailVerificationMaxAttempts ?? 5)

            // Invalidate any active codes for this user/purpose.
            await AuthRepository.consumeOneTimeCodesForUserPurpose({ userId: user.user_id, purpose })

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

            const purpose = String((config as any)?.auth?.emailVerificationPurpose ?? 'email_verification')
            const tokenHash = sha256Hex(token)
            const codeHash = sha256Hex(code)

            const otp = await AuthRepository.getValidOneTimeCodeForPurposeAndTokenHash({
                purpose,
                tokenHash,
                codeHash,
            })
            if (!otp) return AuthErrorHandler.invalidToken()

            const attempts = Number(otp.attempt_count ?? 0)
            const maxAttempts = Number((config as any)?.auth?.emailVerificationMaxAttempts ?? 5)
            if (Number.isFinite(maxAttempts) && attempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

            // Mark verified, consume the code.
            await AuthRepository.setUserEmailVerified(otp.user_id)
            try { await AuthRepository.consumeOneTimeCode(otp.code_id) } catch {}

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

    async requestPasswordReset(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
        try {
            const identifier = getString(params, 'identifier')
            if (!AuthValidate.validateIdentifier(identifier)) {
                return AuthErrorHandler.invalidParameters(v.getAlerts())
            }

            // Avoid account enumeration: always return success.
            let user = null
            if (identifier && isEmail(identifier)) user = await AuthRepository.getUserByEmail(identifier)
            else if (identifier) user = await AuthRepository.getUserByUsername(identifier)

            if (!user || !user.user_em) {
                return { code: 200, msg: successMsgs.requestPasswordReset ?? 'OK' }
            }

            const ctx = getRequestCtx(params)

            const expiresSeconds = Number((config as any)?.auth?.passwordResetExpiresSeconds ?? 900)
            const maxAttempts = Number((config as any)?.auth?.passwordResetMaxAttempts ?? 5)
            const purpose = String((config as any)?.auth?.passwordResetPurpose ?? 'password_reset')

            // Single active reset per user: invalidate previous.
            try { await AuthRepository.invalidateActivePasswordResetsForUser(user.user_id) } catch {}
            try { await AuthRepository.consumeOneTimeCodesForUserPurpose({ userId: user.user_id, purpose }) } catch {}

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

    async verifyPasswordReset(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
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
            if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
                return AuthErrorHandler.expiredToken()
            }

            const codeHash = sha256Hex(code)
            const otp = await AuthRepository.getValidOneTimeCode({ userId: reset.user_id, purpose, codeHash })
            if (!otp) {
                try { await AuthRepository.incrementPasswordResetAttempt(reset.reset_id) } catch {}
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

            if (!AuthValidate.validateToken(token) || !AuthValidate.validateCode(code) || !AuthValidate.validateNewPassword(newPassword, { min: 8, max: 200 })) {
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
            if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
                return AuthErrorHandler.expiredToken()
            }

            const codeHash = sha256Hex(code)
            const otp = await AuthRepository.getValidOneTimeCode({ userId: reset.user_id, purpose, codeHash })
            if (!otp) {
                try { await AuthRepository.incrementPasswordResetAttempt(reset.reset_id) } catch {}
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
            try { await AuthRepository.consumeOneTimeCode(otp.code_id) } catch {}
            try { await AuthRepository.markPasswordResetUsed(reset.reset_id) } catch {}

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
`

    return src
}

export function getAuthPresetFiles(repoRoot: string) {
    const objectName = 'Auth'
    const baseDir = path.join(repoRoot, 'BO', objectName)

    return [
        { p: path.join(baseDir, `${objectName}BO.ts`), c: templateAuthBO() },
        { p: path.join(baseDir, `${objectName}.ts`), c: templateAuthRepo() },
        { p: path.join(baseDir, `${objectName}Validate.ts`), c: templateAuthValidate() },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}SuccessMsgs.json`),
            c: templateAuthSuccessMsgs(),
        },
        { p: path.join(baseDir, `${objectName}ErrorHandler.ts`), c: templateAuthErrorHandler() },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}ErrorMsgs.json`),
            c: templateAuthErrorMsgs(),
        },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}Alerts.json`),
            c: templateAuthAlertsLabels(),
        },
    ]
}
