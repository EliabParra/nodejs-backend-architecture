import 'dotenv/config'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

globalThis.require = createRequire(import.meta.url)

function envBool(value) {
    if (value == null) return undefined
    const v = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
    return undefined
}

function envInt(value) {
    if (value == null) return undefined
    const n = Number.parseInt(String(value), 10)
    return Number.isFinite(n) ? n : undefined
}

function applyEnvOverrides(cfg) {
    cfg.app = cfg.app ?? {}
    cfg.db = cfg.db ?? {}
    cfg.session = cfg.session ?? {}
    cfg.session.cookie = cfg.session.cookie ?? {}
    cfg.cors = cfg.cors ?? {}
    cfg.log = cfg.log ?? {}

    const appPort = envInt(process.env.APP_PORT)
    if (appPort != null) cfg.app.port = appPort
    if (process.env.APP_HOST) cfg.app.host = process.env.APP_HOST
    if (process.env.APP_NAME) cfg.app.name = String(process.env.APP_NAME)
    if (process.env.APP_LANG) cfg.app.lang = process.env.APP_LANG
    if (process.env.APP_FRONTEND_MODE) cfg.app.frontendMode = String(process.env.APP_FRONTEND_MODE)

    // Reverse proxy / load balancer
    // Express "trust proxy" setting: boolean | number | string.
    if (process.env.APP_TRUST_PROXY != null) {
        const raw = String(process.env.APP_TRUST_PROXY).trim()
        const asInt = envInt(raw)
        const asBool = envBool(raw)
        if (asInt != null) cfg.app.trustProxy = asInt
        else if (asBool != null) cfg.app.trustProxy = asBool
        else if (raw.length > 0) cfg.app.trustProxy = raw
    }

    // Postgres / pg
    // Supports standard PG* vars and DATABASE_URL.
    if (process.env.DATABASE_URL) cfg.db.connectionString = process.env.DATABASE_URL
    if (process.env.PGHOST) cfg.db.host = process.env.PGHOST
    if (process.env.PGPORT) {
        const port = envInt(process.env.PGPORT)
        if (port != null) cfg.db.port = port
    }
    if (process.env.PGDATABASE) cfg.db.database = process.env.PGDATABASE
    if (process.env.PGUSER) cfg.db.user = process.env.PGUSER
    if (process.env.PGPASSWORD) cfg.db.password = process.env.PGPASSWORD
    const pgSsl = envBool(process.env.PGSSL)
    if (pgSsl != null) cfg.db.ssl = pgSsl

    // Session secrets
    // express-session supports string OR array of strings (rotation)
    if (process.env.SESSION_SECRETS) {
        const secrets = String(process.env.SESSION_SECRETS)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        if (secrets.length > 0) cfg.session.secret = secrets
    } else if (process.env.SESSION_SECRET) {
        cfg.session.secret = String(process.env.SESSION_SECRET)
    }

    // Session store location (connect-pg-simple)
    // Useful if you want the session table under a different schema (e.g. `security`).
    cfg.session.store = cfg.session.store ?? {}
    if (process.env.SESSION_SCHEMA)
        cfg.session.store.schemaName = String(process.env.SESSION_SCHEMA).trim()
    if (process.env.SESSION_TABLE)
        cfg.session.store.tableName = String(process.env.SESSION_TABLE).trim()

    // Optional cookie overrides (useful behind HTTPS/proxy)
    const cookieSecure = envBool(process.env.SESSION_COOKIE_SECURE)
    if (cookieSecure != null) cfg.session.cookie.secure = cookieSecure
    if (process.env.SESSION_COOKIE_SAMESITE)
        cfg.session.cookie.sameSite = process.env.SESSION_COOKIE_SAMESITE
    const cookieMaxAge = envInt(process.env.SESSION_COOKIE_MAXAGE_MS)
    if (cookieMaxAge != null) cfg.session.cookie.maxAge = cookieMaxAge

    // CORS overrides (useful for production without editing config.json)
    const corsEnabled = envBool(process.env.CORS_ENABLED)
    if (corsEnabled != null) cfg.cors.enabled = corsEnabled
    const corsCredentials = envBool(process.env.CORS_CREDENTIALS)
    if (corsCredentials != null) cfg.cors.credentials = corsCredentials
    if (process.env.CORS_ORIGINS) {
        const origins = String(process.env.CORS_ORIGINS)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        if (origins.length > 0) cfg.cors.origins = origins
    }

    // Logging
    // LOG_FORMAT=text|json (json = one-line JSON per event, better for log aggregation)
    if (process.env.LOG_FORMAT) cfg.log.format = String(process.env.LOG_FORMAT).trim().toLowerCase()

    return cfg
}

function mergeQueries(base, extra) {
    if (!extra || typeof extra !== 'object') return base
    const out = { ...(base ?? {}) }
    for (const [schema, schemaQueries] of Object.entries(extra)) {
        if (!schemaQueries || typeof schemaQueries !== 'object') continue
        out[schema] = { ...(out[schema] ?? {}), ...schemaQueries }
    }
    return out
}

function repoPath(...parts) {
    const srcDir = path.dirname(fileURLToPath(import.meta.url))
    const repoRoot = path.resolve(srcDir, '..')
    return path.resolve(repoRoot, ...parts)
}

function resolveRepoRelative(p) {
    const raw = String(p ?? '').trim()
    if (!raw) return null
    return path.isAbsolute(raw) ? raw : repoPath(raw)
}

globalThis.config = applyEnvOverrides(globalThis.require('./config/config.json'))

const baseQueries = globalThis.require('./config/queries.json')
let queries = baseQueries

// Optional: enable the demo queries under examples/ (keeps core template demo-agnostic).
// - DEMO_QUERIES=true loads the default file under examples/bo-demo/
// - DEMO_QUERIES_PATH can point to a different JSON file (absolute or repo-relative)
if (envBool(process.env.DEMO_QUERIES)) {
    const demoPath =
        resolveRepoRelative(process.env.DEMO_QUERIES_PATH) ??
        repoPath('examples', 'bo-demo', 'config', 'queries.enterprise.json')
    queries = mergeQueries(queries, globalThis.require(demoPath))
}

// Optional: merge additional queries (absolute path or repo-relative).
// Example: QUERIES_EXTRA_PATH=examples/bo-demo/config/queries.enterprise.json
if (process.env.QUERIES_EXTRA_PATH) {
    const extraPath = resolveRepoRelative(process.env.QUERIES_EXTRA_PATH)
    if (extraPath) queries = mergeQueries(queries, globalThis.require(extraPath))
}

globalThis.queries = queries
globalThis.msgs = globalThis.require('./config/messages.json')
const { default: Validator } = await import('./BSS/Validator.js')
const { default: Log } = await import('./BSS/Log.js')
const { default: DBComponent } = await import('./BSS/DBComponent.js')
globalThis.v = new Validator()
globalThis.log = new Log()
globalThis.db = new DBComponent()

// NOTE:
// Do NOT instantiate Security here.
// Security's constructor triggers async init which queries the DB.
// That breaks CLI scripts that import globals for config/db/log (e.g. scripts/bo.mjs).
// Server startup (src/index.js) is responsible for creating globalThis.security.
