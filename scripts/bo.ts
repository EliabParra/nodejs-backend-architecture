import 'dotenv/config'
import '../src/globals.js'

import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { pathToFileURL } from 'node:url'

import * as ts from 'typescript'

import {
    authMethods as presetAuthMethods,
    templateAuthSuccessMsgs as presetTemplateAuthSuccessMsgs,
    templateAuthErrorMsgs as presetTemplateAuthErrorMsgs,
    templateAuthAlertsLabels as presetTemplateAuthAlertsLabels,
    templateAuthErrorHandler as presetTemplateAuthErrorHandler,
    templateAuthValidate as presetTemplateAuthValidate,
    templateAuthRepo as presetTemplateAuthRepo,
    templateAuthBO as presetTemplateAuthBO,
} from './bo-auth-preset.js'

const repoRoot = process.cwd()

type BoOptValue = string | boolean
type BoOpts = Record<string, BoOptValue>

async function promptYesNo(rl: any, question: string, defaultYes = false) {
    const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] '
    const ans = String(await rl.question(question + suffix))
        .trim()
        .toLowerCase()
    if (!ans) return defaultYes
    return ['y', 'yes'].includes(ans)
}

async function promptChoice(rl: any, question: string, choices: string[], defaultValue: string) {
    const normalized = choices.map((c) => String(c).trim().toLowerCase())
    const def = defaultValue != null ? String(defaultValue).trim().toLowerCase() : undefined
    const suffix = def != null ? ` (${def}) ` : ' '

    while (true) {
        const ans = String(await rl.question(`${question} (${normalized.join('|')})${suffix}`))
            .trim()
            .toLowerCase()
        const value = ans.length > 0 ? ans : def
        if (value && normalized.includes(value)) return value
        console.log(`Please choose one of: ${normalized.join(', ')}`)
    }
}

async function promptText(rl: any, question: string, defaultValue: string) {
    const suffix = defaultValue != null ? ` (${defaultValue}) ` : ' '
    const ans = String(await rl.question(question + suffix)).trim()
    return ans.length > 0 ? ans : defaultValue
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

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
        auth                         Create Auth BO preset (register/email verification/password reset)
    sync [ObjectName]            Read BO methods and upsert to DB (tx mapping)
                                                            Use --all to sync all BOs under /BO
  list                         List objects/methods/tx from DB
  perms                        Grant/revoke permissions (interactive)
  perms --profile <id> --allow Object.method[,Object.method]
  perms --profile <id> --deny  Object.method[,Object.method]

Options:
    --yes                        Non-interactive (disable prompts)
  --methods <m1,m2,...>         Methods to scaffold (new)
  --crud                        Scaffold CRUD-style methods (default)
  --force                       Overwrite existing files (new)
  --db                          Also upsert object/method/tx in DB (new)
  --tx <n1,n2,...>              Explicit tx per method (new/sync)
  --txStart <n>                 Starting tx if auto-assigning
  --dry                         Print what would change, do nothing
    --all                         Sync all BOs (sync)
    --prune                       Delete stale DB methods (in DB but not in code) (sync)

Notes:
- After changing tx/perms in DB, restart the server (Security cache loads on startup).
- Requires DATABASE_URL / PG* env vars or config.json DB settings.

Interactive mode:
- Run without args in a TTY to choose commands/options.
`)
}

function isTty() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function isInteractive(opts: any): boolean {
    return isTty() && opts?.yes !== true
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
        try {
            await fs.access(jsPath)
            return jsPath
        } catch {
            throw new Error(
                `BO source file not found for ${objectName} (expected ${tsPath} or ${jsPath})`
            )
        }
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
                    ? `            // Recommended pattern (applies to all methods):\n            // 1) validate/normalize (Validate)\n            // 2) execute operation (Repository/services)\n            // 3) return { code, msg, data?, alerts? }\n\n`
                    : ''

            return `    async ${m}(params: Record<string, unknown> | null | undefined): Promise<ApiResponse> {
        try {
${patternComment}            // TODO: validate/normalize
            // if (!${objectName}Validate.validateX(params)) return ${objectName}ErrorHandler.invalidParameters(v.getAlerts())

            // TODO: implement your real operation
            // const result = await ${objectName}Repository.someOperation(params)

            return {
                code: 200,
                msg: successMsgs.${m} ?? '${escapeTemplateBraces(`${objectName} ${m} OK`)}',
                data: params ?? null,
            }
        } catch (err: unknown) {
            log.show({
                type: log.TYPE_ERROR,
                msg:
                    msgs[config.app.lang].errors.server.serverError.msg +
                    ', ${objectName}BO.${m}: ' +
                    (err instanceof Error ? err.message : String(err)),
            })
            return ${objectName}ErrorHandler.unknownError()
        }
    }`
        })
        .join('\n\n')

    return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

import { ${objectName}ErrorHandler } from './${objectName}ErrorHandler.js'
import { ${objectName}Validate } from './${objectName}Validate.js'
import { ${objectName}Repository } from './${objectName}.js'

type ApiResponse = { code: number; msg: string; data?: Record<string, unknown> | null; alerts?: string[] }

const successMsgs = require('./messages/${objectName.toLowerCase()}SuccessMsgs.json')[config.app.lang] as Record<string, string>

/* ${objectName}BO: métodos async se registran; helpers internos pueden iniciar con "_". En sync se ignoran y no se registran en DB. */

export class ${objectName}BO {
${methodBodies}
}

`
}

function authMethods() {
    return presetAuthMethods()
}

function templateAuthSuccessMsgs() {
    return presetTemplateAuthSuccessMsgs()
}

function templateAuthErrorMsgs() {
    return presetTemplateAuthErrorMsgs()
}

function templateAuthAlertsLabels() {
    return presetTemplateAuthAlertsLabels()
}

function templateAuthErrorHandler() {
    return presetTemplateAuthErrorHandler()
}

function templateAuthValidate() {
    return presetTemplateAuthValidate()
}

function templateAuthRepo() {
    return presetTemplateAuthRepo()
}

function templateAuthBO() {
    return presetTemplateAuthBO()
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
        'deleteMethodByName',
        'deleteObjectIfNoMethods',
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
    // In dry mode we should not require DB connectivity.
    if (!opts.dry) await ensureDbQueries()

    // Ask developer for tx numbers when doing real DB writes and none were specified.
    if (!opts.dry && !opts.tx && opts.txStart == null && isInteractive(opts)) {
        const nextTx = await getNextTx()
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        try {
            console.log('Methods:', methods.join(', '))
            const mode = await promptChoice(rl, 'TX mapping mode', ['auto', 'explicit'], 'auto')

            if (mode === 'explicit') {
                const ans = String(
                    await rl.question(
                        `Enter comma-separated tx numbers (same count=${methods.length}): `
                    )
                ).trim()
                if (ans.length === 0) {
                    throw new Error('Explicit tx mapping selected but no tx list was provided')
                }
                opts.tx = ans
            } else {
                const start = await promptText(rl, 'txStart', String(nextTx))
                opts.txStart = String(start)
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

    let next = txStart ?? (opts.dry ? 1 : await getNextTx())
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

type SyncObject = { objectName: string; boFile: string; methods: string[] }

async function discoverRepoBOs(): Promise<SyncObject[]> {
    const boRoot = path.join(repoRoot, 'BO')
    const entries = await fs.readdir(boRoot, { withFileTypes: true })
    const objects: SyncObject[] = []

    for (const e of entries) {
        if (!e.isDirectory()) continue
        const objectName = e.name
        // Best-effort filter: only PascalCase folders.
        if (!/^[A-Z][A-Za-z0-9]*$/.test(objectName)) continue

        try {
            const boFile = await resolveBoSourceFile(objectName)
            const content = await fs.readFile(boFile, 'utf8')
            const methods = parseMethodsFromBO(content).filter((m) => !m.startsWith('_'))
            if (methods.length === 0) continue
            objects.push({ objectName, boFile, methods })
        } catch {
            // Ignore folders without a BO file.
        }
    }

    objects.sort((a, b) => a.objectName.localeCompare(b.objectName))
    return objects
}

function computeStaleMethods(dbRows: any[], codeObjects: SyncObject[]) {
    const codeMap = new Map<string, Set<string>>()
    for (const o of codeObjects) {
        codeMap.set(o.objectName, new Set(o.methods))
    }

    const stale: Array<{ objectName: string; methodName: string; tx?: number }> = []
    for (const r of dbRows ?? []) {
        const objectName = String(r.object_na)
        const methodName = String(r.method_na)
        const tx = Number(r.tx_nu)
        const codeMethods = codeMap.get(objectName)
        if (!codeMethods || !codeMethods.has(methodName)) {
            stale.push({ objectName, methodName, tx: Number.isFinite(tx) ? tx : undefined })
        }
    }

    stale.sort((a, b) =>
        a.objectName === b.objectName
            ? String(a.methodName).localeCompare(String(b.methodName))
            : String(a.objectName).localeCompare(String(b.objectName))
    )

    return stale
}

function buildDbMethodsIndex(dbRows: any[]) {
    const index = new Map<string, Set<string>>()
    for (const r of dbRows ?? []) {
        const objectName = String(r.object_na)
        const methodName = String(r.method_na)
        if (!index.has(objectName)) index.set(objectName, new Set())
        index.get(objectName)!.add(methodName)
    }
    return index
}

function diffObjectMethods(objectName: string, codeMethods: string[], dbMethodSet?: Set<string>) {
    const codeSet = new Set<string>(codeMethods)
    const dbSet = dbMethodSet ?? new Set<string>()

    const inBoth = Array.from(codeSet)
        .filter((m) => dbSet.has(m))
        .sort()
    const missingInDb = Array.from(codeSet)
        .filter((m) => !dbSet.has(m))
        .sort()
    const staleInDb = Array.from(dbSet)
        .filter((m) => !codeSet.has(m))
        .sort()

    return { inBoth, missingInDb, staleInDb }
}

function printSyncSummary(summary: {
    scopeLabel: string
    objects: Array<{
        objectName: string
        inBoth: string[]
        missingInDb: string[]
        staleInDb: string[]
    }>
}) {
    const totalExisting = summary.objects.reduce((n, o) => n + o.inBoth.length, 0)
    const totalMissing = summary.objects.reduce((n, o) => n + o.missingInDb.length, 0)
    const totalStale = summary.objects.reduce((n, o) => n + o.staleInDb.length, 0)

    console.log(`Sync summary (${summary.scopeLabel}):`)
    console.log(`  existing (code ∩ db): ${totalExisting}`)
    console.log(`  to add   (code − db): ${totalMissing}`)
    console.log(`  to prune (db − code): ${totalStale}`)

    const changed = summary.objects.filter(
        (o) => o.missingInDb.length > 0 || o.staleInDb.length > 0
    )
    if (changed.length === 0) return

    console.log('Changes by object:')
    for (const o of changed) {
        const parts = []
        if (o.missingInDb.length > 0) parts.push(`add=${o.missingInDb.length}`)
        if (o.staleInDb.length > 0) parts.push(`prune=${o.staleInDb.length}`)
        console.log(`  - ${o.objectName}: ${parts.join('  ')}`)
    }
}

async function pruneStaleMethods(
    stale: Array<{ objectName: string; methodName: string }>,
    opts: any
) {
    if (stale.length === 0) return { deleted: 0 }
    await ensureDbQueries()

    const affectedObjects = Array.from(new Set(stale.map((s) => s.objectName)))

    if (opts.dry) {
        console.log('DRY RUN: would delete stale DB methods:')
        stale.forEach((s) => console.log(`  - ${s.objectName}.${s.methodName}`))
        console.log('DRY RUN: would also delete empty objects (no remaining methods):')
        affectedObjects.forEach((o) => console.log(`  - ${o}`))
        return { deleted: stale.length }
    }

    // Non-interactive safety: only prune when explicitly requested AND confirmed via --yes.
    if (!isInteractive(opts) && opts.prune !== true) {
        console.log(
            `Detected ${stale.length} stale DB methods (in DB but not in code). Use --prune to delete them.`
        )
        return { deleted: 0 }
    }

    let okToDelete = Boolean(opts.yes)
    if (!okToDelete && isInteractive(opts)) {
        console.log('Detected methods present in DB but not in code:')
        stale.slice(0, 50).forEach((s) => console.log(`  - ${s.objectName}.${s.methodName}`))
        if (stale.length > 50) console.log(`  ...and ${stale.length - 50} more`)
        console.log('Deleting a method will also delete its permissions (cascade).')

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        try {
            okToDelete = await promptYesNo(
                rl,
                'Delete these stale DB methods now? (in DB but not in code)',
                false
            )
        } finally {
            rl.close()
        }
    }

    if (!okToDelete) return { deleted: 0 }

    for (const s of stale) {
        await db.exe('security', 'deleteMethodByName', [s.objectName, s.methodName])
    }

    // Clean up empty objects (only if they have no methods left).
    for (const o of affectedObjects) {
        await db.exe('security', 'deleteObjectIfNoMethods', [o])
    }

    return { deleted: stale.length }
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
    // Sync all BOs mode.
    if (opts.all === true) {
        const codeObjects = await discoverRepoBOs()
        if (codeObjects.length === 0) throw new Error('No BOs found under /BO')

        console.log(`Discovered ${codeObjects.length} BOs in repo.`)

        if (opts.dry) {
            console.log(
                'DRY RUN: cannot diff against DB without connecting. Showing code-only list:'
            )
            codeObjects.forEach((o) =>
                console.log(`  - ${o.objectName}: ${o.methods.length} methods`)
            )
            return
        }

        await ensureDbQueries()

        const dbMethods = await db.exe('security', 'listMethods', null)
        const dbIndex = buildDbMethodsIndex(dbMethods.rows ?? [])

        const perObject = codeObjects.map((o) => {
            const diff = diffObjectMethods(o.objectName, o.methods, dbIndex.get(o.objectName))
            return { objectName: o.objectName, ...diff }
        })

        printSyncSummary({ scopeLabel: 'all BOs', objects: perObject })

        let proceed = true
        if (isInteractive(opts)) {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
            try {
                proceed = await promptYesNo(rl, 'Apply these changes to DB now?', true)
            } finally {
                rl.close()
            }
        }
        if (!proceed) return

        // Apply inserts for missing methods only (do not touch existing).
        for (const o of codeObjects) {
            const diff = diffObjectMethods(o.objectName, o.methods, dbIndex.get(o.objectName))
            if (diff.missingInDb.length === 0) continue
            const mapping = await upsertMethodsToDb(o.objectName, diff.missingInDb, opts)
            console.log(`Synced ${o.objectName} new methods:`, mapping)
        }

        // Optionally prune stale DB methods.
        const stale = computeStaleMethods(dbMethods.rows ?? [], codeObjects)
        if (stale.length > 0) {
            const result = await pruneStaleMethods(
                stale.map((s) => ({ objectName: s.objectName, methodName: s.methodName })),
                opts
            )
            if (result.deleted > 0) console.log(`Pruned ${result.deleted} stale DB methods.`)
        }

        console.log('Sync-all complete. Restart the server to reload Security cache.')
        return
    }

    // Single-object sync.
    validateObjectName(objectName)
    const boFile = await resolveBoSourceFile(objectName)
    const content = await fs.readFile(boFile, 'utf8')
    const methods = parseMethodsFromBO(content).filter((m) => !m.startsWith('_'))

    if (methods.length === 0) throw new Error(`No methods found in ${boFile}`)

    if (opts.dry) {
        console.log(`DRY RUN: methods discovered in ${boFile}:`)
        console.log(methods.join(', '))
        // Keep historical behavior: show the would-upsert mapping without touching DB.
        const mapping = await upsertMethodsToDb(objectName, methods, opts)
        console.log(`DRY RUN: sync would upsert ${objectName} methods:`, mapping)
        console.log('DRY RUN: cannot diff against DB without connecting.')
        return
    }

    await ensureDbQueries()
    const existing = await db.exe('security', 'listMethodsByObject', [objectName])
    const existingSet = new Set<string>((existing.rows ?? []).map((r: any) => String(r.method_na)))
    const diff = diffObjectMethods(objectName, methods, existingSet)

    printSyncSummary({
        scopeLabel: objectName,
        objects: [
            {
                objectName,
                inBoth: diff.inBoth,
                missingInDb: diff.missingInDb,
                staleInDb: diff.staleInDb,
            },
        ],
    })

    let proceed = true
    if (isInteractive(opts)) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        try {
            proceed = await promptYesNo(rl, 'Apply these changes to DB now?', true)
        } finally {
            rl.close()
        }
    }
    if (!proceed) return

    if (diff.missingInDb.length > 0) {
        const mapping = await upsertMethodsToDb(objectName, diff.missingInDb, opts)
        console.log(`Synced ${objectName} new methods:`, mapping)
    } else {
        console.log(`No new methods to add for ${objectName}.`)
    }

    if (diff.staleInDb.length > 0) {
        const stale = diff.staleInDb.map((m) => ({ objectName, methodName: m }))
        const result = await pruneStaleMethods(stale, opts)
        if (result.deleted > 0) console.log(`Pruned ${result.deleted} stale DB methods.`)
    }

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
    let cmd = args[0]

    // If no command is provided and we're in a real terminal, offer an interactive menu.
    if (!cmd && isInteractive(opts)) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        try {
            cmd = await promptChoice(
                rl,
                'Command',
                ['new', 'auth', 'sync', 'list', 'perms', 'help'],
                'new'
            )

            if (cmd === 'new') {
                if (!args[1]) {
                    args[1] = await promptText(rl, 'ObjectName (PascalCase)', 'MyObject')
                }

                if (!opts.methods && !opts.crud) {
                    const mode = await promptChoice(
                        rl,
                        'Scaffold methods',
                        ['crud', 'custom'],
                        'crud'
                    )
                    if (mode === 'custom') {
                        const m = await promptText(rl, 'Methods (comma-separated)', '')
                        if (m.trim().length > 0) opts.methods = m
                    } else {
                        opts.crud = true
                    }
                }

                if (opts.force == null) {
                    const baseDir = path.join(repoRoot, 'BO', String(args[1]))
                    const boPath = path.join(baseDir, `${String(args[1])}BO.ts`)
                    const anyExists = await fileExists(boPath)
                    if (anyExists) {
                        opts.force = await promptYesNo(
                            rl,
                            'Files exist. Overwrite (--force)?',
                            false
                        )
                    }
                }

                if (opts.db == null) {
                    opts.db = await promptYesNo(rl, 'Also upsert methods to DB now (--db)?', false)
                }

                // If we will write to DB, ask TX mapping preferences up-front.
                if (opts.db === true && !opts.tx && opts.txStart == null) {
                    const methodsForCount =
                        typeof opts.methods === 'string' && String(opts.methods).trim().length > 0
                            ? parseCsv(opts.methods)
                            : crudMethods(String(args[1]))

                    const mode = await promptChoice(
                        rl,
                        'TX mapping mode',
                        ['auto', 'explicit'],
                        'auto'
                    )
                    if (mode === 'explicit') {
                        console.log('Methods (order matters):')
                        methodsForCount.forEach((m, i) => console.log(`  [${i + 1}] ${m}`))
                        const ans = await promptText(
                            rl,
                            `Enter comma-separated tx numbers (same count=${methodsForCount.length})`,
                            ''
                        )
                        if (ans.trim().length > 0) opts.tx = ans
                    } else {
                        try {
                            await ensureDbQueries()
                            const nextTx = await getNextTx()
                            const start = await promptText(rl, 'txStart', String(nextTx))
                            if (String(start).trim().length > 0) opts.txStart = String(start)
                        } catch {
                            // If DB isn't available yet, upsertMethodsToDb will prompt later.
                        }
                    }
                }
            }

            if (cmd === 'auth') {
                const authBoPath = path.join(repoRoot, 'BO', 'Auth', 'AuthBO.ts')
                const exists = await fileExists(authBoPath)
                if (exists && opts.force == null) {
                    opts.force = await promptYesNo(
                        rl,
                        'Auth BO exists. Overwrite preset files (--force)?',
                        false
                    )
                }
                if (opts.db == null) {
                    opts.db = await promptYesNo(
                        rl,
                        'Also upsert Auth methods to DB now (--db)?',
                        false
                    )
                }

                if (opts.db === true && !opts.tx && opts.txStart == null) {
                    const methodsForCount = authMethods()
                    const mode = await promptChoice(
                        rl,
                        'TX mapping mode',
                        ['auto', 'explicit'],
                        'auto'
                    )
                    if (mode === 'explicit') {
                        console.log('Auth methods (order matters):')
                        methodsForCount.forEach((m, i) => console.log(`  [${i + 1}] ${m}`))
                        const ans = await promptText(
                            rl,
                            `Enter comma-separated tx numbers (same count=${methodsForCount.length})`,
                            ''
                        )
                        if (ans.trim().length > 0) opts.tx = ans
                    } else {
                        try {
                            await ensureDbQueries()
                            const nextTx = await getNextTx()
                            const start = await promptText(rl, 'txStart', String(nextTx))
                            if (String(start).trim().length > 0) opts.txStart = String(start)
                        } catch {
                            // If DB isn't available yet, upsertMethodsToDb will prompt later.
                        }
                    }
                }
            }

            if (cmd === 'sync') {
                if (opts.all == null) {
                    opts.all = await promptYesNo(rl, 'Sync all BOs (--all)?', false)
                }

                if (opts.all !== true && !args[1]) {
                    args[1] = await promptText(rl, 'ObjectName to sync', 'Auth')
                }
                if (opts.dry == null) {
                    opts.dry = await promptYesNo(rl, 'Dry run (--dry)?', false)
                }

                if (opts.prune == null && !opts.dry) {
                    opts.prune = await promptYesNo(
                        rl,
                        'Delete stale DB methods (in DB but not in code)? (--prune)',
                        false
                    )
                }

                // If we will write to DB, ask TX mapping preferences up-front.
                if (!opts.dry && !opts.tx && opts.txStart == null) {
                    const mode = await promptChoice(
                        rl,
                        'TX mapping mode',
                        ['auto', 'explicit'],
                        'auto'
                    )
                    if (mode === 'explicit') {
                        // Best-effort: show methods in this BO to make tx entry easier.
                        try {
                            validateObjectName(args[1])
                            const boFile = await resolveBoSourceFile(String(args[1]))
                            const content = await fs.readFile(boFile, 'utf8')
                            const methods = parseMethodsFromBO(content).filter(
                                (m) => !m.startsWith('_')
                            )
                            if (methods.length > 0) {
                                console.log('Methods (order matters):')
                                methods.forEach((m, i) => console.log(`  [${i + 1}] ${m}`))
                            }
                        } catch {
                            // If we can't read/parse here, cmdSync/upsertMethodsToDb will still guide later.
                        }
                        const ans = await promptText(
                            rl,
                            `Enter comma-separated tx numbers (same count as methods)`,
                            ''
                        )
                        if (ans.trim().length > 0) opts.tx = ans
                    } else {
                        // Best-effort: fetch nextTx to offer a good default.
                        try {
                            await ensureDbQueries()
                            const nextTx = await getNextTx()
                            const start = await promptText(rl, 'txStart', String(nextTx))
                            if (String(start).trim().length > 0) opts.txStart = String(start)
                        } catch {
                            // If DB isn't available yet, upsertMethodsToDb will prompt later.
                        }
                    }
                }
            }
        } finally {
            rl.close()
        }
    }

    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
        printHelp()
        return
    }

    try {
        if (cmd === 'new') {
            // In TTY, allow prompting for missing object name.
            if (!args[1] && isInteractive(opts)) {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                })
                try {
                    args[1] = await promptText(rl, 'ObjectName (PascalCase)', 'MyObject')
                } finally {
                    rl.close()
                }
            }
            await cmdNew(args[1], opts)
            return
        }
        if (cmd === 'auth') {
            await cmdAuth(opts)
            return
        }
        if (cmd === 'sync') {
            if (opts.all !== true && !args[1] && isInteractive(opts)) {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                })
                try {
                    args[1] = await promptText(rl, 'ObjectName to sync', 'Auth')
                } finally {
                    rl.close()
                }
            }
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
