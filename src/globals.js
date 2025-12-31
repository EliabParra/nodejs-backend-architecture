import 'dotenv/config'
import { createRequire } from 'node:module'

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

	const appPort = envInt(process.env.APP_PORT)
	if (appPort != null) cfg.app.port = appPort
	if (process.env.APP_HOST) cfg.app.host = process.env.APP_HOST
	if (process.env.APP_LANG) cfg.app.lang = process.env.APP_LANG
	if (process.env.APP_FRONTEND_MODE) cfg.app.frontendMode = String(process.env.APP_FRONTEND_MODE)

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
			.map(s => s.trim())
			.filter(Boolean)
		if (secrets.length > 0) cfg.session.secret = secrets
	} else if (process.env.SESSION_SECRET) {
		cfg.session.secret = String(process.env.SESSION_SECRET)
	}

	// Optional cookie overrides (useful behind HTTPS/proxy)
	const cookieSecure = envBool(process.env.SESSION_COOKIE_SECURE)
	if (cookieSecure != null) cfg.session.cookie.secure = cookieSecure
	if (process.env.SESSION_COOKIE_SAMESITE) cfg.session.cookie.sameSite = process.env.SESSION_COOKIE_SAMESITE
	const cookieMaxAge = envInt(process.env.SESSION_COOKIE_MAXAGE_MS)
	if (cookieMaxAge != null) cfg.session.cookie.maxAge = cookieMaxAge

	return cfg
}

globalThis.config = applyEnvOverrides(globalThis.require('./config/config.json'))
globalThis.queries = globalThis.require('./config/queries.json')
globalThis.msgs = globalThis.require('./config/messages.json')
const { default: Validator } = await import('./BSS/Validator.js')
const { default: Log } = await import('./BSS/Log.js')
const { default: DBComponent } = await import('./BSS/DBComponent.js')
const { default: Security } = await import('./BSS/Security.js')
globalThis.v = new Validator()
globalThis.log = new Log()
globalThis.db = new DBComponent()
globalThis.security = new Security()