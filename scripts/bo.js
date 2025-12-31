import 'dotenv/config'
import '../src/globals.js'

import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { pathToFileURL } from 'node:url'

const repoRoot = process.cwd()

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

function parseArgs(argv) {
  const args = []
  const opts = {}
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

function validateObjectName(name) {
  if (!name || typeof name !== 'string') throw new Error('ObjectName is required')
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    throw new Error('ObjectName must be PascalCase (e.g. Person, OrderItem)')
  }
}

function parseCsv(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function crudMethods(objectName) {
  return [`get${objectName}`, `create${objectName}`, `update${objectName}`, `delete${objectName}`]
}

function escapeTemplateBraces(s) {
  return s.replaceAll('{', '\\{').replaceAll('}', '\\}')
}

async function writeFileSafe(filePath, content, force) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  if (!force) {
    await fs.writeFile(filePath, content, { flag: 'wx' })
  } else {
    await fs.writeFile(filePath, content)
  }
}

function templateSuccessMsgs(objectName, methods) {
  const es = {}
  const en = {}
  for (const m of methods) {
    es[m] = `${objectName} ${m} OK`
    en[m] = `${objectName} ${m} OK`
  }
  return JSON.stringify({ es, en }, null, 2) + '\n'
}

function templateErrorMsgs() {
  return JSON.stringify({
    es: {
      notFound: { msg: 'Recurso no encontrado', code: 404 },
      invalidParameters: { msg: 'Parámetros inválidos', code: 400 },
      unauthorized: { msg: 'No autorizado', code: 401 },
      unknownError: { msg: 'Error desconocido', code: 500 }
    },
    en: {
      notFound: { msg: 'Resource not found', code: 404 },
      invalidParameters: { msg: 'Invalid parameters', code: 400 },
      unauthorized: { msg: 'Unauthorized', code: 401 },
      unknownError: { msg: 'Unknown error', code: 500 }
    }
  }, null, 2) + '\n'
}

function templateAlertsLabels(objectName) {
  return JSON.stringify({
    es: { labels: { id: 'El id', name: 'El nombre' } },
    en: { labels: { id: 'The id', name: 'The name' } }
  }, null, 2) + '\n'
}

function templateErrorHandler(objectName) {
  return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const errorMsgs = require('./${objectName.toLowerCase()}ErrorMsgs.json')[config.app.lang]

export class ${objectName}ErrorHandler {
  static notFound() { return errorMsgs.notFound }

  static invalidParameters(alerts) {
    const { code, msg } = errorMsgs.invalidParameters
    return { code, msg, alerts: alerts ?? [] }
  }

  static unauthorized() { return errorMsgs.unauthorized }

  static unknownError() { return errorMsgs.unknownError }
}
`
}

function templateValidate(objectName) {
  return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const labels = require('./errors/${objectName.toLowerCase()}Alerts.json')[config.app.lang].labels

/*
${objectName}Validate

Guía rápida:
- Mantén la validación aquí (no en el BO) para que sea reutilizable.
- Usa el validator global [0m(v)[0m y retorna boolean. Si retorna false, el BO puede responder invalidParameters con v.getAlerts().
 - Usa el validator global (v) y retorna boolean. Si retorna false, el BO puede responder invalidParameters con v.getAlerts().
- Prefiere normalizar (trim/casteos) antes de persistir.
*/

export class ${objectName}Validate {
  static normalizeId(value) {
    return typeof value === 'string' ? Number(value) : value
  }

  static normalizeText(value) {
    return typeof value === 'string' ? value.trim() : value
  }

  static validateId(value) {
    const num = this.normalizeId(value)
    return v.validateInt({ value: num, label: labels.id })
  }

  static validateName(value, { min = 1, max = 200 } = {}) {
    const name = this.normalizeText(value)
    if (typeof name !== 'string') return v.validateString({ value: name, label: labels.name })
    return v.validateLength({ value: name, label: labels.name }, min, max)
  }

  // Ejemplo de patrón genérico: un lookup puede ser por id o por nombre.
  // Ajusta esto según tu entidad.
  static getLookupMode(value) {
    if (this.validateId(value)) return 'id'
    if (this.validateName(value)) return 'name'
    return null
  }
}
`
}

function templateRepo(objectName) {
  return `/*
${objectName}Repository

Guía rápida:
- Este módulo contiene acceso a datos (DB), aislado del BO.
- Define tus SQL en src/config/queries.json y ejecútalas con db.exe('<schema>', '<queryName>', params).
- No asumas un schema fijo: cambia 'enterprise' por el schema real de tu dominio.
*/

export class ${objectName} {
  constructor(params) {
    Object.assign(this, params)
  }
}

export class ${objectName}Repository {
  // Reemplaza 'enterprise' y 'TODO_*' con tu schema/queries reales.

  static async getById(id) {
    const r = await db.exe('enterprise', 'TODO_getById', [id])
    if (!r?.rows || r.rows.length === 0) return null
    return new ${objectName}(r.rows[0])
  }

  static async getByName(name) {
    const r = await db.exe('enterprise', 'TODO_getByName', [name])
    if (!r?.rows || r.rows.length === 0) return null
    return new ${objectName}(r.rows[0])
  }

  static async create(params) {
    // Ejemplo: await db.exe('enterprise', 'TODO_create', [..])
    await db.exe('enterprise', 'TODO_create', [params])
    return true
  }

  static async update(params) {
    await db.exe('enterprise', 'TODO_update', [params])
    return true
  }

  static async delete(params) {
    await db.exe('enterprise', 'TODO_delete', [params])
    return true
  }
}
`
}

function templateBO(objectName, methods) {
  const methodBodies = methods.map(m => {
    return `  async ${m}(params) {
    try {
      // Patrón recomendado:
      // 1) validar + normalizar (en Validate)
      // 2) ejecutar repositorio (DB) en Repository
      // 3) retornar { code, msg, data, alerts? } siguiendo el contrato

      // TODO: implementa validación según tu caso
      // if (!${objectName}Validate.validateX(params)) return ${objectName}ErrorHandler.invalidParameters(v.getAlerts())

      // TODO: implementa tu operación real (DB/servicios/etc.)
      // const result = await ${objectName}Repository.someOperation(params)

      return { code: 200, msg: successMsgs.${m} ?? '${escapeTemplateBraces(`${objectName} ${m} OK`)}', data: params ?? null }
    } catch (err) {
      log.show({ type: log.TYPE_ERROR, msg: \`${msgs[config.app.lang].errors.server.serverError.msg}, ${objectName}BO.${m}: \${err?.message || err}\` })
      return ${objectName}ErrorHandler.unknownError()
    }
  }`
  }).join('\n\n')

  return `import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

import { ${objectName}ErrorHandler } from './errors/${objectName}ErrorHandler.js'
import { ${objectName}Validate } from './${objectName}Validate.js'
import { ${objectName}Repository } from './${objectName}.js'

const successMsgs = require('./${objectName.toLowerCase()}SuccessMsgs.json')[config.app.lang]

/*
${objectName}BO

Reglas del framework:
- Solo métodos async del BO se registran como "métodos de negocio" (tx + permisos).
- Si necesitas helpers internos, pueden iniciar con "_" (ej. _mapRow, _normalize). En sync se ignoran y no se registran en DB.
- Mantén el BO delgado: valida en Validate y usa Repository para DB.
*/

export class ${objectName}BO {
${methodBodies}
}
`
}

function parseMethodsFromBO(fileContent) {
  const methods = new Set()
  // Only register methods declared as: async <name>(...)
  // This avoids accidentally picking up helper calls or nested functions.
  const re = /\basync\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  let m
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
    'listPermissionsByProfile'
  ]
  const missing = required.filter(k => !queries?.security?.[k])
  if (missing.length > 0) {
    throw new Error(`Missing security queries: ${missing.join(', ')}`)
  }
}

async function getNextTx() {
  const r = await db.exe('security', 'getNextTx', null)
  return Number(r.rows?.[0]?.next_tx)
}

async function upsertMethodsToDb(objectName, methods, opts) {
  await ensureDbQueries()

  const explicitTx = parseCsv(opts.tx).map(n => Number(n))
  if (explicitTx.length > 0 && explicitTx.length !== methods.length) {
    throw new Error('--tx must have same amount as --methods')
  }

  let txStart = opts.txStart != null ? Number(opts.txStart) : undefined
  if (!Number.isFinite(txStart)) txStart = undefined

  let next = txStart ?? await getNextTx()
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

async function cmdNew(objectName, opts) {
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
    { p: path.join(baseDir, `${objectName}BO.js`), c: templateBO(objectName, methods) },
    { p: path.join(baseDir, `${objectName}.js`), c: templateRepo(objectName) },
    { p: path.join(baseDir, `${objectName}Validate.js`), c: templateValidate(objectName) },
    { p: path.join(baseDir, `${objectName.toLowerCase()}SuccessMsgs.json`), c: templateSuccessMsgs(objectName, methods) },
    { p: path.join(baseDir, 'errors', `${objectName}ErrorHandler.js`), c: templateErrorHandler(objectName) },
    { p: path.join(baseDir, 'errors', `${objectName.toLowerCase()}ErrorMsgs.json`), c: templateErrorMsgs() },
    { p: path.join(baseDir, 'errors', `${objectName.toLowerCase()}Alerts.json`), c: templateAlertsLabels(objectName) }
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

async function cmdSync(objectName, opts) {
  validateObjectName(objectName)
  const boFile = path.join(repoRoot, 'BO', objectName, `${objectName}BO.js`)
  const content = await fs.readFile(boFile, 'utf8')
  const methods = parseMethodsFromBO(content)
    .filter(m => !m.startsWith('_'))

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

async function resolveMethodId(objectName, methodName) {
  const r = await db.exe('security', 'resolveMethodId', [objectName, methodName])
  const row = r.rows?.[0]
  if (!row?.method_id) return null
  return { methodId: row.method_id, tx: row.tx_nu }
}

async function applyPerm(profileId, fqMethods, mode, opts) {
  await ensureDbQueries()
  const profile = Number(profileId)
  if (!Number.isInteger(profile) || profile <= 0) throw new Error('--profile must be a positive integer')

  const results = []
  for (const fq of fqMethods) {
    const [objectName, methodName] = String(fq).split('.')
    if (!objectName || !methodName) throw new Error(`Invalid method format: ${fq} (use Object.method)`) 

    const resolved = await resolveMethodId(objectName, methodName)
    if (!resolved) throw new Error(`Method not found in DB: ${objectName}.${methodName}`)

    if (opts.dry) {
      results.push({ action: mode, profile, objectName, methodName, methodId: resolved.methodId })
      continue
    }

    if (mode === 'allow') await db.exe('security', 'grantPermission', [profile, resolved.methodId])
    else await db.exe('security', 'revokePermission', [profile, resolved.methodId])

    results.push({ action: mode, profile, objectName, methodName, tx: resolved.tx })
  }

  return results
}

async function cmdPerms(opts) {
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
    const profileIds = (profiles.rows ?? []).map(r => r.profile_id)
    console.log('Profiles:', profileIds.join(', '))
    const p = await rl.question('Profile id: ')

    const objects = await db.exe('security', 'listObjects', null)
    const objectNames = (objects.rows ?? []).map(r => r.object_na)
    console.log('Objects:', objectNames.join(', '))
    const o = await rl.question('Object (exact): ')

    const methods = await db.exe('security', 'listMethodsByObject', [o])
    const rows = methods.rows ?? []
    if (rows.length === 0) {
      console.log('No methods for object. Use: npm run bo -- sync ' + o)
      return
    }

    rows.forEach((r, idx) => {
      console.log(`[${idx + 1}] ${r.object_na}.${r.method_na}  tx=${r.tx_nu}`)
    })

    const action = (await rl.question('Action (allow/deny): ')).trim().toLowerCase() === 'deny' ? 'deny' : 'allow'
    const pick = await rl.question('Select methods (e.g. 1,2,5): ')
    const idxs = parseCsv(pick).map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 1 && n <= rows.length)
    const selected = idxs.map(i => `${rows[i - 1].object_na}.${rows[i - 1].method_na}`)

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
    console.error('ERROR:', err?.message ?? err)
    process.exitCode = 1
  } finally {
    try { await db?.pool?.end?.() } catch { }
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
  parseMethodsFromBO
}

if (isMainModule()) {
  await main()
}
