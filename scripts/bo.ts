import 'dotenv/config'
import '../src/globals.js'

import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { pathToFileURL } from 'node:url'

import * as ts from 'typescript'

const repoRoot = process.cwd()

type BoOptValue = string | boolean
type BoOpts = Record<string, BoOptValue>

function formatError(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
        return String((err as { message?: unknown }).message)
    }
    return String(err)
}

function isMainModule() {
    const entry = process.argv?.[1]
    if (!entry) return false
    return import.meta.url === pathToFileURL(path.resolve(entry)).href
}

function printHelp() {
    console.log(`
BO CLI

Usage:
  npm run bo -- <command> [args] [options]

Commands:
  new  <ObjectName>            Create BO folder + files
    auth                         Create Auth BO preset (password reset 2-step)
  sync <ObjectName>            Read BO methods and upsert to DB (tx mapping)
  list                         List objects/methods/tx from DB
  perms                        Grant/revoke permissions (interactive)
  perms --profile <id> --allow Object.method[,Object.method]
  perms --profile <id> --deny  Object.method[,Object.method]

Options:
  --methods <m1,m2,...>         Methods to scaffold (new)
  --crud                        Scaffold CRUD-style methods (default)
  --force                       Overwrite existing files (new)
  --db                          Also upsert object/method/tx in DB (new)
  --tx <n1,n2,...>              Explicit tx per method (new/sync)
  --txStart <n>                 Starting tx if auto-assigning
  --dry                         Print what would change, do nothing

Notes:
- After changing tx/perms in DB, restart the server (Security cache loads on startup).
- Requires DATABASE_URL / PG* env vars or config.json DB settings.
`)
}

function isTty() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function parseArgs(argv: string[]): { args: string[]; opts: BoOpts } {
    const args: string[] = []
    const opts: BoOpts = {}
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a.startsWith('--')) {
            const key = a.slice(2)
            const next = argv[i + 1]
            if (next == null || next.startsWith('--')) {
                opts[key] = true
            } else {
                opts[key] = next
                i++
            }
        } else {
            args.push(a)
        }
    }
    return { args, opts }
}

function validateObjectName(name: unknown): asserts name is string {
    if (!name || typeof name !== 'string') throw new Error('ObjectName is required')
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
        throw new Error('ObjectName must be PascalCase (e.g. Person, OrderItem)')
    }
}

function parseCsv(value: unknown): string[] {
    if (!value) return []
    return String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
}

function crudMethods(objectName: string): string[] {
    return [`get${objectName}`, `create${objectName}`, `update${objectName}`, `delete${objectName}`]
}

function escapeTemplateBraces(s: string): string {
    return s.replaceAll('{', '\\{').replaceAll('}', '\\}')
}

async function writeFileSafe(filePath: string, content: string, force: boolean): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })

    async function writeOne(p: string, c: string): Promise<void> {
        if (!force) {
            await fs.writeFile(p, c, { flag: 'wx' })
        } else {
            await fs.writeFile(p, c)
        }
    }

    await writeOne(filePath, content)
}

async function resolveBoSourceFile(objectName: string): Promise<string> {
    const baseDir = path.join(repoRoot, 'BO', objectName)
    const tsPath = path.join(baseDir, `${objectName}BO.ts`)
    const jsPath = path.join(baseDir, `${objectName}BO.js`)
    try {
        await fs.access(tsPath)
        return tsPath
    } catch {
        return jsPath
    }
}

function templateSuccessMsgs(objectName: string, methods: string[]): string {
    const es: Record<string, string> = {}
    const en: Record<string, string> = {}
    for (const m of methods) {
        es[m] = `${objectName} ${m} OK`
        en[m] = `${objectName} ${m} OK`
    }
    return JSON.stringify({ es, en }, null, 2) + '\n'
}

function templateErrorMsgs() {
    return (
        JSON.stringify(
            {
                es: {
                    notFound: { msg: 'Recurso no encontrado', code: 404 },
                    invalidParameters: { msg: 'Parámetros inválidos', code: 400 },
                    unauthorized: { msg: 'No autorizado', code: 401 },
                    unknownError: { msg: 'Error desconocido', code: 500 },
                },
                en: {
                    notFound: { msg: 'Resource not found', code: 404 },
                    invalidParameters: { msg: 'Invalid parameters', code: 400 },
                    unauthorized: { msg: 'Unauthorized', code: 401 },
                    unknownError: { msg: 'Unknown error', code: 500 },
                },
            },
            null,
            2
        ) + '\n'
    )
}

function templateAlertsLabels(objectName: string) {
    return (
        JSON.stringify(
            {
                es: { labels: { id: 'El id', name: 'El nombre' } },
                en: { labels: { id: 'The id', name: 'The name' } },
            },
            null,
            2
        ) + '\n'
    )
}

function templateErrorHandler(objectName: string) {
    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

type ApiError = { code: number; msg: string; alerts?: string[] }
type ErrorMsgs = Record<string, ApiError>

const errorMsgs = require('./messages/${objectName.toLowerCase()}ErrorMsgs.json')[config.app.lang] as ErrorMsgs

export class ${objectName}ErrorHandler {
    static notFound(): ApiError { return errorMsgs.notFound }

    static invalidParameters(alerts?: string[]): ApiError {
    const { code, msg } = errorMsgs.invalidParameters
    return { code, msg, alerts: alerts ?? [] }
  }

    static unauthorized(): ApiError { return errorMsgs.unauthorized }

    static unknownError(): ApiError { return errorMsgs.unknownError }
}
`
}

function templateValidate(objectName: string) {
    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const labels = require('./messages/${objectName.toLowerCase()}Alerts.json')[config.app.lang].labels as Record<string, string>

/* ${objectName}Validate: validación/normalización reutilizable */

export class ${objectName}Validate {
    static normalizeId(value: unknown): unknown {
    return typeof value === 'string' ? Number(value) : value
  }

    static normalizeText(value: unknown): unknown {
    return typeof value === 'string' ? value.trim() : value
  }

    static validateId(value: unknown): boolean {
    const num = this.normalizeId(value)
    return v.validateInt({ value: num, label: labels.id })
  }

    static validateName(value: unknown, { min = 1, max = 200 }: { min?: number; max?: number } = {}): boolean {
    const name = this.normalizeText(value)
    if (typeof name !== 'string') return v.validateString({ value: name, label: labels.name })
    return v.validateLength({ value: name, label: labels.name }, min, max)
  }

  // Ejemplo de patrón genérico: un lookup puede ser por id o por nombre.
  // Ajusta esto según tu entidad.
    static getLookupMode(value: unknown): 'id' | 'name' | null {
        if (this.validateId(value)) return 'id'
        if (this.validateName(value)) return 'name'
    return null
  }
}
`
}

function templateRepo(objectName: string) {
    return `/*
${objectName}Repository

- Acceso a datos (DB) aislado del BO.
- Reemplaza 'domain' y TODO_* por tu schema/queries reales.
*/

export class ${objectName} {
    constructor(params: Record<string, unknown>) {
    Object.assign(this, params)
  }
}

export class ${objectName}Repository {
  // Reemplaza 'domain' y 'TODO_*' con tu schema/queries reales.

    static async getById(id: number): Promise<${objectName} | null> {
    const r = await db.exe('domain', 'TODO_getById', [id])
    if (!r?.rows || r.rows.length === 0) return null
    return new ${objectName}(r.rows[0])
  }

    static async getByName(name: string): Promise<${objectName} | null> {
    const r = await db.exe('domain', 'TODO_getByName', [name])
    if (!r?.rows || r.rows.length === 0) return null
    return new ${objectName}(r.rows[0])
  }

    static async create(params: Record<string, unknown>): Promise<boolean> {
    await db.exe('domain', 'TODO_create', [params])
    return true
  }

    static async update(params: Record<string, unknown>): Promise<boolean> {
    await db.exe('domain', 'TODO_update', [params])
    return true
  }

    static async delete(params: Record<string, unknown>): Promise<boolean> {
    await db.exe('domain', 'TODO_delete', [params])
    return true
  }
}
`
}

function templateBO(objectName: string, methods: string[]) {
    const methodBodies = methods
        .map((m, idx) => {
            const patternComment =
                idx === 0
                    ? `      // Patrón recomendado (aplica a todos los métodos):\n      // 1) validar/normalizar (Validate)\n      // 2) ejecutar operación (Repository/servicios)\n      // 3) retornar { code, msg, data?, alerts? }\n\n`
                    : ''

            return `  async ${m}(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
    try {
${patternComment}      // TODO: valida/normaliza según tu caso
      // if (!${objectName}Validate.validateX(params)) return ${objectName}ErrorHandler.invalidParameters(v.getAlerts())

      // TODO: implementa tu operación real
      // const result = await ${objectName}Repository.someOperation(params)

            return { code: 200, msg: successMsgs.${m} ?? '${escapeTemplateBraces(`${objectName} ${m} OK`)}', data: params ?? null }
    } catch (err) {
      log.show({ type: log.TYPE_ERROR, msg: \`${msgs[config.app.lang].errors.server.serverError.msg}, ${objectName}BO.${m}: \${err?.message || err}\` })
      return ${objectName}ErrorHandler.unknownError()
    }
  }`
        })
        .join('\n\n')

    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

type ApiResponse = { code: number; msg: string; data?: Record<string, unknown> | null; alerts?: string[] }

import { ${objectName}ErrorHandler } from './${objectName}ErrorHandler.js'
import { ${objectName}Validate } from './${objectName}Validate.js'
import { ${objectName}Repository } from './${objectName}.js'

const successMsgs = require('./messages/${objectName.toLowerCase()}SuccessMsgs.json')[config.app.lang] as Record<string, string>

/* ${objectName}BO: métodos async se registran; helpers internos pueden iniciar con "_". En sync se ignoran y no se registran en DB. */

export class ${objectName}BO {
${methodBodies}
}

`
}

function authMethods() {
    return ['requestPasswordReset', 'verifyPasswordReset', 'resetPassword']
}

function templateAuthSuccessMsgs() {
    // Keep keys aligned with method names.
    return (
        JSON.stringify(
            {
                es: {
                    requestPasswordReset: 'Si existe una cuenta, enviaremos instrucciones al email',
                    verifyPasswordReset: 'Verificación correcta',
                    resetPassword: 'Contraseña actualizada',
                },
                en: {
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

function templateAuthErrorMsgs() {
    return (
        JSON.stringify(
            {
                es: {
                    invalidParameters: { msg: 'Parámetros inválidos', code: 400 },
                    invalidToken: { msg: 'Token inválido', code: 401 },
                    expiredToken: { msg: 'Token expirado', code: 401 },
                    tooManyRequests: { msg: 'Demasiados intentos, inténtalo más tarde', code: 429 },
                    unknownError: { msg: 'Error desconocido', code: 500 },
                },
                en: {
                    invalidParameters: { msg: 'Invalid parameters', code: 400 },
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

function templateAuthAlertsLabels() {
    return (
        JSON.stringify(
            {
                es: {
                    labels: {
                        identifier: 'El email o usuario',
                        email: 'El email',
                        token: 'El token',
                        code: 'El código',
                        newPassword: 'La nueva contraseña',
                    },
                },
                en: {
                    labels: {
                        identifier: 'Email or username',
                        email: 'Email',
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

function templateAuthErrorHandler() {
    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

type ApiError = { code: number; msg: string; alerts?: string[] }
type AuthErrorKey =
    | 'invalidParameters'
    | 'invalidToken'
    | 'expiredToken'
    | 'tooManyRequests'
    | 'alreadyRegistered'
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
    static unknownError(): ApiError { return errorMsgs.unknownError }
}
`
}

function templateAuthValidate() {
    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
type AuthLabels = {
    identifier: string
    email: string
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

function templateAuthRepo() {
    return `/*
Auth Repository

- Isola acceso a DB para el BO.
*/

type UserRow = { user_id: number; user_em?: string | null }
type PasswordResetRow = { reset_id: number; user_id: number; expires_at?: string | Date | null; used_at?: string | Date | null; attempt_count?: number | null }
type OneTimeCodeRow = { code_id: number; user_id: number; attempt_count?: number | null }

export class AuthRepository {
    static async getUserByEmail(email: string): Promise<UserRow | null> {
        const r = (await db.exe('security', 'getUserByEmail', [email])) as { rows?: UserRow[] }
        return r.rows?.[0] ?? null
    }

    static async getUserByUsername(username: string): Promise<UserRow | null> {
        const r = (await db.exe('security', 'getUserByUsername', [username])) as { rows?: UserRow[] }
        return r.rows?.[0] ?? null
    }

    static async insertPasswordReset({ userId, tokenHash, sentTo, expiresSeconds, ip, userAgent }: { userId: number; tokenHash: string; sentTo: string; expiresSeconds: number; ip?: string | null; userAgent?: string | null }): Promise<void> {
        await db.exe('security', 'insertPasswordReset', [
            userId,
            tokenHash,
            sentTo,
            String(expiresSeconds),
            ip ?? null,
            userAgent ?? null,
        ])
    }

    static async getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRow | null> {
        const r = (await db.exe('security', 'getPasswordResetByTokenHash', [tokenHash])) as { rows?: PasswordResetRow[] }
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

    static async insertOneTimeCode({ userId, purpose, codeHash, expiresSeconds, meta }: { userId: number; purpose: string; codeHash: string; expiresSeconds: number; meta?: Record<string, unknown> }): Promise<boolean> {
        await db.exe('security', 'insertOneTimeCode', [
            userId,
            purpose,
            codeHash,
            String(expiresSeconds),
            JSON.stringify(meta ?? {}),
        ])
        return true
    }

    static async getValidOneTimeCode({ userId, purpose, codeHash }: { userId: number; purpose: string; codeHash: string }): Promise<OneTimeCodeRow | null> {
        const r = (await db.exe('security', 'getValidOneTimeCodeForPurpose', [userId, purpose, codeHash])) as { rows?: OneTimeCodeRow[] }
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

    static async updateUserPassword({ userId, passwordHash }: { userId: number; passwordHash: string }): Promise<boolean> {
        await db.exe('security', 'updateUserPassword', [userId, passwordHash])
        return true
    }
}
`
}

function templateAuthBO() {
    // Note: BO lives under /BO and is dynamically imported by Security.
    // It can still import src/* via relative path.
    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

type ApiResponse = { code: number; msg: string; data?: Record<string, unknown> | null; alerts?: string[] }

import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'

import { AuthErrorHandler } from './AuthErrorHandler.js'
import { AuthValidate } from './AuthValidate.js'
import { AuthRepository } from './Auth.js'
import EmailService from '../../src/BSS/EmailService.js'

const successMsgs = require('./messages/authSuccessMsgs.json')[config.app.lang] as Record<string, string>
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

export class AuthBO {
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

            const expiresSeconds = Number(config?.auth?.passwordResetExpiresSeconds ?? 900)
            const maxAttempts = Number(config?.auth?.passwordResetMaxAttempts ?? 5)
            const purpose = String(config?.auth?.passwordResetPurpose ?? 'password_reset')

            const token = randomBytes(32).toString('hex')
            const code = String(Math.floor(100000 + Math.random() * 900000))
            const tokenHash = sha256Hex(token)
            const codeHash = sha256Hex(code)

            await AuthRepository.insertPasswordReset({
                userId: user.user_id,
                tokenHash,
                sentTo: user.user_em,
                expiresSeconds,
                ip: null,
                userAgent: null,
            })
            await AuthRepository.insertOneTimeCode({
                userId: user.user_id,
                purpose,
                codeHash,
                expiresSeconds,
                meta: { tokenHash, maxAttempts },
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

            const purpose = String(config?.auth?.passwordResetPurpose ?? 'password_reset')
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
            const maxAttempts = Number(config?.auth?.passwordResetMaxAttempts ?? 5)
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
                    String(err?.message || err),
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

            const purpose = String(config?.auth?.passwordResetPurpose ?? 'password_reset')
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
            const maxAttempts = Number(config?.auth?.passwordResetMaxAttempts ?? 5)
            if (Number.isFinite(maxAttempts) && attempts >= maxAttempts) {
                return AuthErrorHandler.tooManyRequests()
            }

            const hash = await bcrypt.hash(String(newPassword), 10)
            await AuthRepository.updateUserPassword({ userId: reset.user_id, passwordHash: hash })

            // Best effort: consume code + mark reset used.
            try { await AuthRepository.consumeOneTimeCode(otp.code_id) } catch {}
            try { await AuthRepository.markPasswordResetUsed(reset.reset_id) } catch {}

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
`
}

function parseMethodsFromBO(fileContent: string): string[] {
    const methods = new Set<string>()
    // Only register methods declared as: async <name>(...)
    // This avoids accidentally picking up helper calls or nested functions.
    const re = /\basync\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(fileContent)) != null) {
        const name = m[1]
        if (!name) continue
        if (['constructor'].includes(name)) continue
        if (name.startsWith('#')) continue
        methods.add(name)
    }
    return Array.from(methods)
}

async function ensureDbQueries() {
    const required = [
        'getNextTx',
        'ensureObject',
        'upsertMethodTx',
        'listObjects',
        'listProfiles',
        'listMethodsByObject',
        'listMethods',
        'resolveMethodId',
        'grantPermission',
        'revokePermission',
        'listPermissionsByProfile',
    ]
    const missing = required.filter((k) => !queries?.security?.[k])
    if (missing.length > 0) {
        throw new Error(`Missing security queries: ${missing.join(', ')}`)
    }
}

async function getNextTx() {
    const r = await db.exe('security', 'getNextTx', null)
    return Number(r.rows?.[0]?.next_tx)
}

async function upsertMethodsToDb(objectName: string, methods: string[], opts: any) {
    await ensureDbQueries()

    // Ask developer for tx numbers when doing real DB writes and none were specified.
    if (!opts.dry && opts.db && !opts.tx && opts.txStart == null && isTty()) {
        const nextTx = await getNextTx()
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        try {
            console.log('Methods:', methods.join(', '))
            const ans = String(
                await rl.question(
                    `TX mapping: enter comma-separated tx (same count) OR press enter to auto-assign from txStart=${nextTx}: `
                )
            ).trim()
            if (ans.length > 0) {
                opts.tx = ans
            } else {
                opts.txStart = String(nextTx)
            }
        } finally {
            rl.close()
        }
    }

    const explicitTx = parseCsv(opts.tx).map((n) => Number(n))
    if (explicitTx.length > 0 && explicitTx.length !== methods.length) {
        throw new Error('--tx must have same amount as --methods')
    }

    let txStart = opts.txStart != null ? Number(opts.txStart) : undefined
    if (!Number.isFinite(txStart)) txStart = undefined

    let next = txStart ?? (await getNextTx())
    const mapping = []

    for (let i = 0; i < methods.length; i++) {
        const method = methods[i]
        const tx = explicitTx.length > 0 ? explicitTx[i] : next++
        mapping.push({ method, tx })
    }

    if (opts.dry) {
        console.log('DRY RUN: would upsert methods:', mapping)
        return mapping
    }

    await db.exe('security', 'ensureObject', [objectName])

    for (const m of mapping) {
        await db.exe('security', 'upsertMethodTx', [objectName, m.method, m.tx])
    }

    return mapping
}

async function cmdAuth(opts: any) {
    const objectName = 'Auth'
    const methods = authMethods()

    const force = Boolean(opts.force)
    const baseDir = path.join(repoRoot, 'BO', objectName)

    if (opts.dry) {
        console.log(`DRY RUN: would create ${baseDir}`)
    } else {
        await fs.mkdir(baseDir, { recursive: true })
    }

    const files = [
        { p: path.join(baseDir, `${objectName}BO.ts`), c: templateAuthBO() },
        { p: path.join(baseDir, `${objectName}.ts`), c: templateAuthRepo() },
        { p: path.join(baseDir, `${objectName}Validate.ts`), c: templateAuthValidate() },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}SuccessMsgs.json`),
            c: templateAuthSuccessMsgs(),
        },
        {
            p: path.join(baseDir, `${objectName}ErrorHandler.ts`),
            c: templateAuthErrorHandler(),
        },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}ErrorMsgs.json`),
            c: templateAuthErrorMsgs(),
        },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}Alerts.json`),
            c: templateAuthAlertsLabels(),
        },
    ]

    for (const f of files) {
        if (opts.dry) console.log('DRY RUN write', f.p)
        else await writeFileSafe(f.p, f.c, force)
    }

    console.log(`Created BO ${objectName} with methods: ${methods.join(', ')}`)

    if (opts.db) {
        const mapping = await upsertMethodsToDb(objectName, methods, opts)
        console.log('DB tx mapping:', mapping)
        console.log('Restart the server to reload Security cache.')
    }
}

async function cmdNew(objectName: string, opts: any) {
    validateObjectName(objectName)

    const methods = opts.methods ? parseCsv(opts.methods) : crudMethods(objectName)
    if (methods.length === 0) throw new Error('No methods to create')

    const force = Boolean(opts.force)

    const baseDir = path.join(repoRoot, 'BO', objectName)

    if (opts.dry) {
        console.log(`DRY RUN: would create ${baseDir}`)
    } else {
        await fs.mkdir(baseDir, { recursive: true })
    }

    const files = [
        { p: path.join(baseDir, `${objectName}BO.ts`), c: templateBO(objectName, methods) },
        { p: path.join(baseDir, `${objectName}.ts`), c: templateRepo(objectName) },
        { p: path.join(baseDir, `${objectName}Validate.ts`), c: templateValidate(objectName) },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}SuccessMsgs.json`),
            c: templateSuccessMsgs(objectName, methods),
        },
        {
            p: path.join(baseDir, `${objectName}ErrorHandler.ts`),
            c: templateErrorHandler(objectName),
        },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}ErrorMsgs.json`),
            c: templateErrorMsgs(),
        },
        {
            p: path.join(baseDir, 'messages', `${objectName.toLowerCase()}Alerts.json`),
            c: templateAlertsLabels(objectName),
        },
    ]

    for (const f of files) {
        if (opts.dry) console.log('DRY RUN write', f.p)
        else await writeFileSafe(f.p, f.c, force)
    }

    console.log(`Created BO ${objectName} with methods: ${methods.join(', ')}`)

    if (opts.db) {
        const mapping = await upsertMethodsToDb(objectName, methods, opts)
        console.log('DB tx mapping:', mapping)
        console.log('Restart the server to reload Security cache.')
    }
}

async function cmdSync(objectName: string, opts: any) {
    validateObjectName(objectName)
    const boFile = await resolveBoSourceFile(objectName)
    const content = await fs.readFile(boFile, 'utf8')
    const methods = parseMethodsFromBO(content).filter((m) => !m.startsWith('_'))

    if (methods.length === 0) throw new Error(`No methods found in ${boFile}`)

    const mapping = await upsertMethodsToDb(objectName, methods, opts)
    console.log(`Synced ${objectName} methods:`, mapping)
    console.log('Restart the server to reload Security cache.')
}

async function cmdList() {
    await ensureDbQueries()
    const r = await db.exe('security', 'listMethods', null)
    for (const row of r.rows ?? []) {
        console.log(`${row.object_na}.${row.method_na}  tx=${row.tx_nu}`)
    }
}

async function resolveMethodId(objectName: string, methodName: string) {
    const r = await db.exe('security', 'resolveMethodId', [objectName, methodName])
    const row = r.rows?.[0]
    if (!row?.method_id) return null
    return { methodId: row.method_id, tx: row.tx_nu }
}

async function applyPerm(
    profileId: string | number,
    fqMethods: string[],
    mode: 'allow' | 'deny',
    opts: any
) {
    await ensureDbQueries()
    const profile = Number(profileId)
    if (!Number.isInteger(profile) || profile <= 0)
        throw new Error('--profile must be a positive integer')

    const results = []
    for (const fq of fqMethods) {
        const [objectName, methodName] = String(fq).split('.')
        if (!objectName || !methodName)
            throw new Error(`Invalid method format: ${fq} (use Object.method)`)

        if (opts.dry) {
            // DRY RUN must be DB-safe: do not resolve ids, do not touch DB.
            results.push({ action: mode, profile, objectName, methodName })
            continue
        }

        const resolved = await resolveMethodId(objectName, methodName)
        if (!resolved) throw new Error(`Method not found in DB: ${objectName}.${methodName}`)

        if (mode === 'allow')
            await db.exe('security', 'grantPermission', [profile, resolved.methodId])
        else await db.exe('security', 'revokePermission', [profile, resolved.methodId])

        results.push({ action: mode, profile, objectName, methodName, tx: resolved.tx })
    }

    return results
}

async function cmdPerms(opts: any) {
    const profile = opts.profile
    const allow = parseCsv(opts.allow)
    const deny = parseCsv(opts.deny)

    if (profile && (allow.length > 0 || deny.length > 0)) {
        const mode = allow.length > 0 ? 'allow' : 'deny'
        const list = allow.length > 0 ? allow : deny
        const r = await applyPerm(profile, list, mode, opts)
        console.log(r)
        console.log('Restart the server to reload Security cache.')
        return
    }

    // Interactive
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    try {
        const profiles = await db.exe('security', 'listProfiles', null)
        const profileIds = (profiles.rows ?? []).map((r: any) => r.profile_id)
        console.log('Profiles:', profileIds.join(', '))
        const p = await rl.question('Profile id: ')

        const objects = await db.exe('security', 'listObjects', null)
        const objectNames = (objects.rows ?? []).map((r: any) => r.object_na)
        console.log('Objects:', objectNames.join(', '))
        const o = await rl.question('Object (exact): ')

        const methods = await db.exe('security', 'listMethodsByObject', [o])
        const rows = methods.rows ?? []
        if (rows.length === 0) {
            console.log('No methods for object. Use: npm run bo -- sync ' + o)
            return
        }

        rows.forEach((r: any, idx: number) => {
            console.log(`[${idx + 1}] ${r.object_na}.${r.method_na}  tx=${r.tx_nu}`)
        })

        const action =
            (await rl.question('Action (allow/deny): ')).trim().toLowerCase() === 'deny'
                ? 'deny'
                : 'allow'
        const pick = await rl.question('Select methods (e.g. 1,2,5): ')
        const idxs = parseCsv(pick)
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= rows.length)
        const selected = idxs.map((i) => `${rows[i - 1].object_na}.${rows[i - 1].method_na}`)

        const r = await applyPerm(p, selected, action, opts)
        console.log('Done:', r)
        console.log('Restart the server to reload Security cache.')
    } finally {
        rl.close()
    }
}

async function main() {
    const { args, opts } = parseArgs(process.argv.slice(2))
    const cmd = args[0]

    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
        printHelp()
        return
    }

    try {
        if (cmd === 'new') {
            await cmdNew(args[1], opts)
            return
        }
        if (cmd === 'auth') {
            await cmdAuth(opts)
            return
        }
        if (cmd === 'sync') {
            await cmdSync(args[1], opts)
            return
        }
        if (cmd === 'list') {
            await cmdList()
            return
        }
        if (cmd === 'perms') {
            await cmdPerms(opts)
            return
        }

        console.error('Unknown command:', cmd)
        printHelp()
        process.exitCode = 1
    } catch (err) {
        console.error('ERROR:', formatError(err))
        process.exitCode = 1
    } finally {
        try {
            await db?.pool?.end?.()
        } catch {}
    }
}

export {
    parseArgs,
    validateObjectName,
    parseCsv,
    crudMethods,
    templateSuccessMsgs,
    templateErrorMsgs,
    templateAlertsLabels,
    templateErrorHandler,
    templateValidate,
    templateRepo,
    templateBO,
    authMethods,
    templateAuthBO,
    parseMethodsFromBO,
}

if (isMainModule()) {
    await main()
}
