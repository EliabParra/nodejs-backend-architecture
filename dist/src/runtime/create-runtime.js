import 'dotenv/config';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Log from '../BSS/Log.js';
import Validator from '../BSS/Validator.js';
import DBComponent from '../BSS/DBComponent.js';
import Security from '../BSS/Security.js';
function envBool(value) {
    if (value == null)
        return undefined;
    const v = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(v))
        return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(v))
        return false;
    return undefined;
}
function envInt(value) {
    if (value == null)
        return undefined;
    const n = Number.parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
}
function mergeQueries(base, extra) {
    if (!extra || typeof extra !== 'object')
        return base;
    const out = { ...(base ?? {}) };
    for (const [schema, schemaQueries] of Object.entries(extra)) {
        if (!schemaQueries || typeof schemaQueries !== 'object')
            continue;
        out[schema] = { ...(out[schema] ?? {}), ...schemaQueries };
    }
    return out;
}
function repoPath(...parts) {
    const srcDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(srcDir, '..', '..');
    return path.resolve(repoRoot, ...parts);
}
function resolveRepoRelative(p) {
    const raw = String(p ?? '').trim();
    if (!raw)
        return null;
    return path.isAbsolute(raw) ? raw : repoPath(raw);
}
function applyEnvOverrides(cfg) {
    cfg.app = cfg.app ?? {};
    cfg.db = cfg.db ?? {};
    cfg.session = cfg.session ?? {};
    cfg.session.cookie = cfg.session.cookie ?? {};
    cfg.cors = cfg.cors ?? {};
    cfg.bo = cfg.bo ?? {};
    cfg.log = cfg.log ?? {};
    cfg.auth = cfg.auth ?? {};
    cfg.email = cfg.email ?? {};
    const appPort = envInt(process.env.APP_PORT);
    if (appPort != null)
        cfg.app.port = appPort;
    if (process.env.APP_HOST)
        cfg.app.host = process.env.APP_HOST;
    if (process.env.APP_NAME)
        cfg.app.name = String(process.env.APP_NAME);
    if (process.env.APP_LANG)
        cfg.app.lang = process.env.APP_LANG;
    if (process.env.APP_FRONTEND_MODE)
        cfg.app.frontendMode = String(process.env.APP_FRONTEND_MODE);
    if (process.env.APP_TRUST_PROXY != null) {
        const raw = String(process.env.APP_TRUST_PROXY).trim();
        const asInt = envInt(raw);
        const asBool = envBool(raw);
        if (asInt != null)
            cfg.app.trustProxy = asInt;
        else if (asBool != null)
            cfg.app.trustProxy = asBool;
        else if (raw.length > 0)
            cfg.app.trustProxy = raw;
    }
    if (process.env.DATABASE_URL)
        cfg.db.connectionString = process.env.DATABASE_URL;
    if (process.env.PGHOST)
        cfg.db.host = process.env.PGHOST;
    if (process.env.PGPORT) {
        const port = envInt(process.env.PGPORT);
        if (port != null)
            cfg.db.port = port;
    }
    if (process.env.PGDATABASE)
        cfg.db.database = process.env.PGDATABASE;
    if (process.env.PGUSER)
        cfg.db.user = process.env.PGUSER;
    if (process.env.PGPASSWORD)
        cfg.db.password = process.env.PGPASSWORD;
    const pgSsl = envBool(process.env.PGSSL);
    if (pgSsl != null)
        cfg.db.ssl = pgSsl;
    if (process.env.SESSION_SECRETS) {
        const secrets = String(process.env.SESSION_SECRETS)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (secrets.length > 0)
            cfg.session.secret = secrets;
    }
    else if (process.env.SESSION_SECRET) {
        cfg.session.secret = String(process.env.SESSION_SECRET);
    }
    cfg.session.store = cfg.session.store ?? {};
    if (process.env.SESSION_SCHEMA)
        cfg.session.store.schemaName = String(process.env.SESSION_SCHEMA).trim();
    if (process.env.SESSION_TABLE)
        cfg.session.store.tableName = String(process.env.SESSION_TABLE).trim();
    const cookieSecure = envBool(process.env.SESSION_COOKIE_SECURE);
    if (cookieSecure != null)
        cfg.session.cookie.secure = cookieSecure;
    if (process.env.SESSION_COOKIE_SAMESITE)
        cfg.session.cookie.sameSite = process.env.SESSION_COOKIE_SAMESITE;
    const cookieMaxAge = envInt(process.env.SESSION_COOKIE_MAXAGE_MS);
    if (cookieMaxAge != null)
        cfg.session.cookie.maxAge = cookieMaxAge;
    const corsEnabled = envBool(process.env.CORS_ENABLED);
    if (corsEnabled != null)
        cfg.cors.enabled = corsEnabled;
    const corsCredentials = envBool(process.env.CORS_CREDENTIALS);
    if (corsCredentials != null)
        cfg.cors.credentials = corsCredentials;
    if (process.env.CORS_ORIGINS) {
        const origins = String(process.env.CORS_ORIGINS)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (origins.length > 0)
            cfg.cors.origins = origins;
    }
    if (process.env.LOG_FORMAT)
        cfg.log.format = String(process.env.LOG_FORMAT).trim().toLowerCase();
    if (process.env.AUTH_LOGIN_ID) {
        const v = String(process.env.AUTH_LOGIN_ID).trim().toLowerCase();
        if (v === 'email' || v === 'username')
            cfg.auth.loginId = v;
    }
    const login2StepNewDevice = envBool(process.env.AUTH_LOGIN_2STEP_NEW_DEVICE);
    if (login2StepNewDevice != null)
        cfg.auth.login2StepNewDevice = login2StepNewDevice;
    const publicProfileId = envInt(process.env.AUTH_PUBLIC_PROFILE_ID);
    if (publicProfileId != null)
        cfg.auth.publicProfileId = publicProfileId;
    const sessionProfileId = envInt(process.env.AUTH_SESSION_PROFILE_ID);
    if (sessionProfileId != null)
        cfg.auth.sessionProfileId = sessionProfileId;
    const requireEmailVerification = envBool(process.env.AUTH_REQUIRE_EMAIL_VERIFICATION);
    if (requireEmailVerification != null)
        cfg.auth.requireEmailVerification = requireEmailVerification;
    if (process.env.EMAIL_MODE)
        cfg.email.mode = String(process.env.EMAIL_MODE).trim().toLowerCase();
    if (process.env.SMTP_HOST)
        cfg.email.smtpHost = String(process.env.SMTP_HOST).trim();
    if (process.env.SMTP_PORT) {
        const p = envInt(process.env.SMTP_PORT);
        if (p != null)
            cfg.email.smtpPort = p;
    }
    if (process.env.SMTP_USER)
        cfg.email.smtpUser = String(process.env.SMTP_USER);
    if (process.env.SMTP_PASS)
        cfg.email.smtpPass = String(process.env.SMTP_PASS);
    const smtpSecure = envBool(process.env.SMTP_SECURE);
    if (smtpSecure != null)
        cfg.email.smtpSecure = smtpSecure;
    if (process.env.SMTP_FROM)
        cfg.email.from = String(process.env.SMTP_FROM);
    cfg.app.lang = String(cfg.app.lang ?? 'es');
    cfg.app.host = String(cfg.app.host ?? 'localhost');
    cfg.app.name = String(cfg.app.name ?? 'app');
    cfg.app.frontendMode = String(cfg.app.frontendMode ?? 'none');
    const port = typeof cfg.app.port === 'number' ? cfg.app.port : envInt(cfg.app.port);
    cfg.app.port = port != null ? port : 3000;
    cfg.bo.path = String(cfg.bo.path ?? '../../BO/');
    return cfg;
}
export async function createRuntimeContext() {
    const require = createRequire(import.meta.url);
    const config = applyEnvOverrides(require('../config/config.json'));
    const baseQueries = require('../config/queries.json');
    let queries = baseQueries;
    if (process.env.QUERIES_EXTRA_PATH) {
        const extraPath = resolveRepoRelative(process.env.QUERIES_EXTRA_PATH);
        if (extraPath)
            queries = mergeQueries(queries, require(extraPath));
    }
    const msgs = require('../config/messages.json');
    const log = new Log(config);
    const v = new Validator(config, msgs);
    const db = new DBComponent({ config, msgs, queries, log });
    const ctx = {
        config,
        msgs,
        queries,
        log,
        v,
        db,
        // set by server bootstrap
        security: undefined,
    };
    return ctx;
}
export async function createServerRuntime() {
    const ctx = await createRuntimeContext();
    const security = new Security(ctx);
    ctx.security = security;
    return { ctx, security };
}
