import 'dotenv/config'

import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import pg from 'pg'
import bcrypt from 'bcryptjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type DbInitOptValue = string | boolean
type DbInitOpts = Record<string, DbInitOptValue>

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

function parseArgs(argv: string[]): { args: string[]; opts: DbInitOpts } {
    const args: string[] = []
    const opts: DbInitOpts = {}
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

function isTty() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function normalizeSchemaName(value) {
    const s = String(value ?? '').trim()
    return s.length > 0 ? s : undefined
}

function normalizeTableName(value) {
    const s = String(value ?? '').trim()
    return s.length > 0 ? s : undefined
}

function printHelp() {
    console.log(`
DB Init CLI

Usage:
  npm run db:init
    node --import tsx scripts/db-init.ts [options]

Options:
  --apply                 Apply changes to the DB (default in TTY)
  --print                 Print SQL only (no DB changes)
  --yes                   Non-interactive (assume yes for prompts)

  --sessionSchema <name>  Session table schema (default: public)
  --sessionTable <name>   Session table name (default: session)

  --includeEmail          Add optional security.user.user_em column
  --seedAdmin             Create/update an admin user + profile (default in TTY)
  --adminUser <name>      Admin username (default: admin)
  --adminPassword <pw>    Admin password (will be bcrypt-hashed)
  --profileId <id>        Profile id to link to admin (default: 1)

    --seedProfiles           If no profiles exist, seed minimal profiles
                                                     (public + session) (default in TTY)
    --publicProfileId <id>   Public (anonymous) profile id (default: 2)
    --sessionProfileId <id>  Session (authenticated) profile id (default: 1)

    --seedPublicAuthPerms    When registering BOs, also grant public profile permissions
                                                     for Auth public methods (register + email verification + password reset)

	--registerBo            Auto-register BO methods into security.method (default in TTY)
	--txStart <n>           Starting tx for new methods (default: max(tx)+1)

Auth (optional module):
    --auth                  Create auth support tables (password reset + OTP)
    --authUsername           Keep username as a supported identifier (default: true)
                                                     When false, user_na becomes optional (nullable).
    --authLoginId <value>    Login identifier: email|username (default: email)
    --authLogin2StepNewDevice  Require email verification on login from a new device

Environment equivalents:
    AUTH_ENABLE=1            Same as --auth
    AUTH_USERNAME=1|0        Same as --authUsername
    AUTH_LOGIN_ID=email|username
    AUTH_LOGIN_2STEP_NEW_DEVICE=1|0

    AUTH_SEED_PROFILES=1|0
    AUTH_PUBLIC_PROFILE_ID=<id>
    AUTH_SESSION_PROFILE_ID=<id>

    AUTH_SEED_PUBLIC_AUTH_PERMS=1|0

DB connection:
  Uses DATABASE_URL when set; otherwise PG* vars; otherwise src/config/config.json.
`)
}

function loadDbConfig() {
    const cfg = require('../src/config/config.json')
    const db = { ...(cfg.db ?? {}) }

    // Supports standard PG* vars and DATABASE_URL.
    if (process.env.DATABASE_URL) db.connectionString = process.env.DATABASE_URL
    if (process.env.PGHOST) db.host = process.env.PGHOST
    if (process.env.PGPORT) {
        const port = envInt(process.env.PGPORT)
        if (port != null) db.port = port
    }
    if (process.env.PGDATABASE) db.database = process.env.PGDATABASE
    if (process.env.PGUSER) db.user = process.env.PGUSER
    if (process.env.PGPASSWORD) db.password = process.env.PGPASSWORD
    const pgSsl = envBool(process.env.PGSSL)
    if (pgSsl != null) db.ssl = pgSsl

    return db
}

function pgClientConfig(db) {
    // pg accepts either connectionString or host/user/password/etc.
    if (db.connectionString) {
        return {
            connectionString: db.connectionString,
            ssl: db.ssl ? { rejectUnauthorized: false } : false,
        }
    }
    return {
        host: db.host,
        port: db.port,
        database: db.database,
        user: db.user,
        password: db.password,
        ssl: db.ssl ? { rejectUnauthorized: false } : false,
    }
}

function sqlSecuritySchemaBase() {
    return [
        `create schema if not exists security;`,
        `create table if not exists security.profile (\n  profile_id bigint generated by default as identity primary key\n);`,
        `create table if not exists security."user" (\n  user_id bigint generated by default as identity primary key,\n  user_na text not null unique,\n  user_pw text not null\n);`,
        `create table if not exists security.user_profile (\n  user_id bigint not null references security."user"(user_id) on delete cascade,\n  profile_id bigint not null references security.profile(profile_id) on delete cascade,\n  primary key (user_id, profile_id)\n);`,
        `create table if not exists security.object (\n  object_id bigint generated by default as identity primary key,\n  object_na text not null unique\n);`,
        `create table if not exists security.method (\n  method_id bigint generated by default as identity primary key,\n  object_id bigint not null references security.object(object_id) on delete cascade,\n  method_na text not null,\n  tx_nu integer not null,\n  constraint uq_method_object unique (object_id, method_na),\n  constraint uq_method_tx unique (tx_nu),\n  constraint ck_method_tx_positive check (tx_nu > 0)\n);`,
        `create table if not exists security.permission_method (\n  profile_id bigint not null references security.profile(profile_id) on delete cascade,\n  method_id bigint not null references security.method(method_id) on delete cascade,\n  primary key (profile_id, method_id)\n);`,
        `create index if not exists ix_user_profile_profile_id on security.user_profile(profile_id);`,
        `create index if not exists ix_method_object_id on security.method(object_id);`,
        `create index if not exists ix_permission_method_method_id on security.permission_method(method_id);`,
    ]
}

function sqlSecurityOptionalEmail() {
    return [
        `alter table security."user" add column if not exists user_em text;`,
        `alter table security."user" add column if not exists email_verified_at timestamptz;`,
        `create unique index if not exists uq_user_em on security."user"(user_em) where user_em is not null;`,
    ]
}

function sqlAuthUserIdentifierTweaks({ authUsername }) {
    // If username support is disabled, allow user_na to be nullable.
    // NOTE: unique constraints already allow multiple NULLs in Postgres.
    if (authUsername) return []
    return [`alter table security."user" alter column user_na drop not null;`]
}

function sqlAuthTables() {
    return [
        `create table if not exists security.password_reset (
  reset_id bigint generated by default as identity primary key,
  user_id bigint not null references security."user"(user_id) on delete cascade,
  token_hash text not null,
  token_sent_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  request_ip inet,
  user_agent text,
  attempt_count integer not null default 0,
  meta jsonb
);`,
        `create unique index if not exists uq_password_reset_token_hash on security.password_reset(token_hash);`,
        `create index if not exists ix_password_reset_user_id on security.password_reset(user_id);`,
        `create index if not exists ix_password_reset_expires_at on security.password_reset(expires_at);`,

        `create table if not exists security.one_time_code (
  code_id bigint generated by default as identity primary key,
  user_id bigint not null references security."user"(user_id) on delete cascade,
  purpose text not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  meta jsonb
);`,
        `create index if not exists ix_one_time_code_user_purpose on security.one_time_code(user_id, purpose, created_at desc);`,
        `create index if not exists ix_one_time_code_expires_at on security.one_time_code(expires_at);`,
    ]
}

function sqlSecurityOperationalColumnsAndAudit() {
    return [
        // Conventional operational columns
        `alter table security.profile add column if not exists profile_na text;`,
        `create unique index if not exists uq_profile_na on security.profile(profile_na) where profile_na is not null;`,

        `alter table security."user" add column if not exists is_active boolean not null default true;`,
        `alter table security."user" add column if not exists created_at timestamptz not null default now();`,
        `alter table security."user" add column if not exists updated_at timestamptz not null default now();`,
        `alter table security."user" add column if not exists last_login_at timestamptz;`,

        // Safe, low-risk constraints (idempotent via DO blocks)
        `do $$ begin\n  alter table security.method add constraint ck_method_tx_positive check (tx_nu > 0);\nexception when duplicate_object then null; end $$;`,
        `do $$ begin\n  alter table security."user" add constraint ck_user_na_not_blank check (length(btrim(user_na)) > 0);\nexception when duplicate_object then null; end $$;`,

        // Audit log (optional to write to, but table is cheap and useful)
        `create table if not exists security.audit_log (\n  audit_id bigint generated by default as identity primary key,\n  time timestamptz not null default now(),\n  request_id text,\n  user_id bigint,\n  profile_id bigint,\n  action text not null,\n  object_na text,\n  method_na text,\n  tx_nu integer,\n  meta jsonb\n);`,
        `create index if not exists ix_audit_log_time on security.audit_log(time desc);`,
        `create index if not exists ix_audit_log_user_id on security.audit_log(user_id);`,
        `create index if not exists ix_audit_log_action on security.audit_log(action);`,
    ]
}

function sqlSessionTable(schemaName, tableName) {
    const schema = schemaName ?? 'public'
    const table = tableName ?? 'session'
    const qualified = schema === 'public' ? `public.${table}` : `${schema}.${table}`
    const prelude = schema !== 'public' ? [`create schema if not exists ${schema};`] : []
    return [
        ...prelude,
        `create table if not exists ${qualified} (\n  sid varchar not null primary key,\n  sess json not null,\n  expire timestamp(6) not null\n);`,
        `create index if not exists ${table}_expire_idx on ${qualified} (expire);`,
    ]
}

async function fileExists(p) {
    try {
        await fs.access(p)
        return true
    } catch {
        return false
    }
}

function parseAsyncMethodsFromBO(fileContent) {
    // We only want business methods defined as `async name(...)`.
    const methods = new Set()
    const re = /\basync\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    let m
    while ((m = re.exec(fileContent)) != null) {
        const name = m[1]
        if (!name) continue
        if (name === 'constructor') continue
        if (name.startsWith('_')) continue
        methods.add(name)
    }
    return Array.from(methods)
}

async function discoverBOs(repoRoot) {
    const boRoot = path.resolve(repoRoot, 'BO')
    if (!(await fileExists(boRoot))) return []

    const entries = await fs.readdir(boRoot, { withFileTypes: true })
    const objects = []
    for (const ent of entries) {
        if (!ent.isDirectory()) continue
        const objectName = ent.name
        const boFileTs = path.join(boRoot, objectName, `${objectName}BO.ts`)
        const boFileJs = path.join(boRoot, objectName, `${objectName}BO.js`)
        const boFile = (await fileExists(boFileTs)) ? boFileTs : boFileJs
        if (!(await fileExists(boFile))) continue
        const content = await fs.readFile(boFile, 'utf8')
        const methods = parseAsyncMethodsFromBO(content)
        if (methods.length === 0) continue
        objects.push({ objectName, boFile, methods })
    }
    return objects
}

async function ensureProfile(client, profileId) {
    await client.query(
        'insert into security.profile (profile_id) values ($1) on conflict (profile_id) do nothing',
        [profileId]
    )
}

async function ensureProfileNamed(client, { profileId, profileName }) {
    // Only set name if it's currently NULL to avoid overwriting existing meaning.
    await client.query(
        'insert into security.profile (profile_id, profile_na) values ($1, $2) on conflict (profile_id) do update set profile_na = coalesce(security.profile.profile_na, excluded.profile_na)',
        [profileId, profileName]
    )
}

async function getProfileCount(client) {
    const r = await client.query('select count(*)::int as n from security.profile')
    return Number(r.rows?.[0]?.n ?? 0)
}

async function getNextTxFromDb(client) {
    const r = await client.query(
        'select coalesce(max(tx_nu), 0) + 1 as next_tx from security.method'
    )
    return Number(r.rows?.[0]?.next_tx)
}

async function upsertObject(client, objectName) {
    const r = await client.query(
        'insert into security.object (object_na) values ($1) on conflict (object_na) do update set object_na = excluded.object_na returning object_id',
        [objectName]
    )
    const objectId = r.rows?.[0]?.object_id
    if (!objectId) throw new Error(`Failed to upsert security.object for ${objectName}`)
    return objectId
}

async function upsertMethodKeepTx(client, { objectId, methodName, txNu }) {
    // If the method already exists, keep existing tx (don't overwrite contracts).
    const r = await client.query(
        `insert into security.method (object_id, method_na, tx_nu)
		 values ($1, $2, $3)
		 on conflict (object_id, method_na)
		 do update set tx_nu = security.method.tx_nu
		 returning method_id, tx_nu`,
        [objectId, methodName, txNu]
    )
    const row = r.rows?.[0]
    if (!row?.method_id) throw new Error(`Failed to upsert security.method for ${methodName}`)
    return { methodId: row.method_id, txNu: Number(row.tx_nu) }
}

async function grantPermission(client, { profileId, methodId }) {
    await client.query(
        'insert into security.permission_method (profile_id, method_id) values ($1, $2) on conflict (profile_id, method_id) do nothing',
        [profileId, methodId]
    )
}

async function resolveMethodIdByName(client, { objectName, methodName }) {
    const r = await client.query(
        `select m.method_id
         from security.method m
         inner join security.object o on o.object_id = m.object_id
         where o.object_na = $1 and m.method_na = $2`,
        [objectName, methodName]
    )
    return r.rows?.[0]?.method_id ?? null
}

async function grantPublicAuthResetPerms(client, { publicProfileId }) {
    const methods = ['requestPasswordReset', 'verifyPasswordReset', 'resetPassword']
    const objectName = 'Auth'

    // Ensure profile exists (does not overwrite name if already set).
    await ensureProfileNamed(client, { profileId: publicProfileId, profileName: 'public' })

    let granted = 0
    for (const methodName of methods) {
        const methodId = await resolveMethodIdByName(client, { objectName, methodName })
        if (!methodId) {
            console.log(
                `WARN: Cannot grant public permission: method not found in DB: ${objectName}.${methodName} (run BO registration first).`
            )
            continue
        }
        await grantPermission(client, { profileId: publicProfileId, methodId })
        granted++
    }

    console.log(
        `Granted ${granted}/${methods.length} public permission(s) to profile_id=${publicProfileId} for Auth password reset methods.`
    )
    return { granted }
}

async function grantPublicAuthRegisterPerms(client, { publicProfileId }) {
    const methods = ['register', 'requestEmailVerification', 'verifyEmail']
    const objectName = 'Auth'

    // Ensure profile exists (does not overwrite name if already set).
    await ensureProfileNamed(client, { profileId: publicProfileId, profileName: 'public' })

    let granted = 0
    for (const methodName of methods) {
        const methodId = await resolveMethodIdByName(client, { objectName, methodName })
        if (!methodId) {
            console.log(
                `WARN: Cannot grant public permission: method not found in DB: ${objectName}.${methodName} (run BO registration first).`
            )
            continue
        }
        await grantPermission(client, { profileId: publicProfileId, methodId })
        granted++
    }

    console.log(
        `Granted ${granted}/${methods.length} public permission(s) to profile_id=${publicProfileId} for Auth registration/email verification methods.`
    )
    return { granted }
}

function printProfileEnvTips({ publicProfileId, sessionProfileId }) {
    console.log('---')
    console.log('Server config tips:')
    if (publicProfileId != null) console.log(`- Set AUTH_PUBLIC_PROFILE_ID=${publicProfileId}`)
    if (sessionProfileId != null)
        console.log(`- (Optional) Set AUTH_SESSION_PROFILE_ID=${sessionProfileId}`)
    console.log('---')
}

async function registerBOs(client, { repoRoot, profileId, txStart }) {
    const bos = await discoverBOs(repoRoot)
    if (bos.length === 0) {
        console.log('No BOs discovered under ./BO (skipping BO registration).')
        return { registered: 0 }
    }

    await ensureProfile(client, profileId)

    let nextTx = txStart != null ? Number(txStart) : await getNextTxFromDb(client)
    if (!Number.isFinite(nextTx) || nextTx <= 0) nextTx = 1

    let registered = 0
    for (const bo of bos) {
        const objectId = await upsertObject(client, bo.objectName)
        for (const methodName of bo.methods) {
            // Pick a tx for new methods; if a tx collision happens (unlikely if nextTx is correct), retry.
            let attempts = 0
            while (attempts < 50) {
                try {
                    const { methodId, txNu } = await upsertMethodKeepTx(client, {
                        objectId,
                        methodName,
                        txNu: nextTx,
                    })
                    await grantPermission(client, { profileId, methodId })
                    registered++
                    // Only advance tx if we actually used it (i.e., method was new).
                    // If the method existed, txNu might be different; in both cases, move forward to keep new tx unique.
                    nextTx = Math.max(nextTx + 1, txNu + 1)
                    break
                } catch (err) {
                    const msg = String(err?.message || err)
                    // Unique tx constraint collision -> increment and retry.
                    if (
                        msg.toLowerCase().includes('uq_method_tx') ||
                        msg.toLowerCase().includes('unique') ||
                        msg.toLowerCase().includes('duplicate')
                    ) {
                        nextTx++
                        attempts++
                        continue
                    }
                    throw err
                }
            }
        }
    }

    console.log(`BO registration complete: ${registered} method(s) upserted/granted.`)
    return { registered }
}

async function promptYesNo(rl, question, defaultYes = false) {
    const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] '
    const ans = String(await rl.question(question + suffix))
        .trim()
        .toLowerCase()
    if (!ans) return defaultYes
    return ['y', 'yes'].includes(ans)
}

async function promptChoice(rl, question, choices, defaultValue) {
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
async function promptText(rl, question, defaultValue) {
    const suffix = defaultValue != null ? ` (${defaultValue}) ` : ' '
    const ans = String(await rl.question(question + suffix)).trim()
    return ans.length > 0 ? ans : defaultValue
}

async function ensureAdminUser(client, { profileId, adminUser, adminHash }) {
    await client.query(
        'insert into security.profile (profile_id) values ($1) on conflict (profile_id) do nothing',
        [profileId]
    )

    const userResult = await client.query(
        'insert into security."user" (user_na, user_pw) values ($1, $2) on conflict (user_na) do update set user_pw = excluded.user_pw returning user_id',
        [adminUser, adminHash]
    )
    const userId = userResult.rows?.[0]?.user_id
    if (!userId) throw new Error('Failed to upsert admin user')

    await client.query(
        'insert into security.user_profile (user_id, profile_id) values ($1, $2) on conflict (user_id, profile_id) do nothing',
        [userId, profileId]
    )

    return { userId, profileId }
}

function sqlAuthLogin2StepTables() {
    return [
        `create table if not exists security.user_device (
    device_id bigint generated by default as identity primary key,
    user_id bigint not null references security."user"(user_id) on delete cascade,
    device_token_hash text not null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    label text,
    user_agent text,
    ip inet,
    meta jsonb
);`,
        `create unique index if not exists uq_user_device_token_hash on security.user_device(device_token_hash);`,
        `create index if not exists ix_user_device_user_id on security.user_device(user_id);`,
        `create index if not exists ix_user_device_active on security.user_device(user_id) where revoked_at is null;`,

        `create table if not exists security.login_challenge (
    challenge_id bigint generated by default as identity primary key,
    user_id bigint not null references security."user"(user_id) on delete cascade,
    token_hash text not null,
    code_hash text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    verified_at timestamptz,
    attempt_count integer not null default 0,
    request_ip inet,
    user_agent text,
    meta jsonb
);`,
        `create unique index if not exists uq_login_challenge_token_hash on security.login_challenge(token_hash);`,
        `create index if not exists ix_login_challenge_user_id on security.login_challenge(user_id);`,
        `create index if not exists ix_login_challenge_expires_at on security.login_challenge(expires_at);`,
    ]
}
async function main() {
    const { opts } = parseArgs(process.argv.slice(2))
    if (opts.help) return printHelp()

    const tty = isTty()
    const nonInteractive = Boolean(opts.yes) || !tty

    const shouldPrint = Boolean(opts.print)
    const shouldApply = Boolean(opts.apply) || (!shouldPrint && tty)

    const sessionSchemaOpt = normalizeSchemaName(
        opts.sessionSchema ?? process.env.SESSION_SCHEMA ?? 'public'
    )
    const sessionTableOpt = normalizeTableName(
        opts.sessionTable ?? process.env.SESSION_TABLE ?? 'session'
    )

    const authEnableEnv = envBool(process.env.AUTH_ENABLE)
    const authEnableOpt = opts.auth === true
    let authEnable = authEnableOpt || authEnableEnv === true
    const authEnableSpecified = authEnableOpt || authEnableEnv != null

    const authLoginIdEnv =
        String(process.env.AUTH_LOGIN_ID ?? '')
            .trim()
            .toLowerCase() || undefined
    const authLoginIdOpt =
        String(opts.authLoginId ?? '')
            .trim()
            .toLowerCase() || undefined
    let authLoginId = authLoginIdOpt || authLoginIdEnv || 'email'
    const authLoginIdSpecified =
        (authLoginIdOpt != null && authLoginIdOpt.length > 0) || authLoginIdEnv != null

    const authUsernameEnv = envBool(process.env.AUTH_USERNAME)
    const authUsernameOpt = envBool(opts.authUsername)
    let authUsername = authUsernameOpt ?? authUsernameEnv ?? true
    const authUsernameSpecified = authUsernameOpt != null || authUsernameEnv != null

    const authLogin2StepNewDeviceEnv = envBool(process.env.AUTH_LOGIN_2STEP_NEW_DEVICE)
    const authLogin2StepNewDeviceOpt = opts.authLogin2StepNewDevice === true
    let authLogin2StepNewDevice = authLogin2StepNewDeviceOpt || authLogin2StepNewDeviceEnv === true
    const authLogin2StepNewDeviceSpecified =
        authLogin2StepNewDeviceOpt || authLogin2StepNewDeviceEnv != null

    // Interactive prompts for auth flags (only in TTY and when not forced non-interactive)
    if (!nonInteractive && tty) {
        const rl = readline.createInterface({ input, output })
        try {
            if (!authEnableSpecified) {
                authEnable = await promptYesNo(
                    rl,
                    'Enable auth tables (password reset + verification codes)?',
                    false
                )
            }
            if (authEnable) {
                if (!authLoginIdSpecified) {
                    authLoginId = await promptChoice(
                        rl,
                        'Login identifier',
                        ['email', 'username'],
                        'email'
                    )
                }

                // If login identifier is username, username support must be on.
                if (authLoginId === 'username') {
                    authUsername = true
                } else if (!authUsernameSpecified) {
                    authUsername = await promptYesNo(
                        rl,
                        'Also support unique username (user_na)?',
                        false
                    )
                }

                if (!authLogin2StepNewDeviceSpecified) {
                    authLogin2StepNewDevice = await promptYesNo(
                        rl,
                        'Enable 2-step login on NEW device (email link + code)?',
                        false
                    )
                }
            }
        } finally {
            rl.close()
        }
    }

    const includeEmail = Boolean(opts.includeEmail) || authEnable || authLoginId === 'email'

    const seedAdminDefault = tty
    const seedAdmin = Boolean(opts.seedAdmin) || (opts.seedAdmin == null && seedAdminDefault)
    const adminUser = String(opts.adminUser ?? 'admin')
    const profileId = Number(opts.profileId ?? 1)

    const seedProfilesDefault = tty
    const seedProfilesEnv = envBool(process.env.AUTH_SEED_PROFILES)
    const seedProfiles =
        Boolean(opts.seedProfiles) ||
        (opts.seedProfiles == null && seedProfilesEnv == null && seedProfilesDefault)
    const publicProfileId = Number(opts.publicProfileId ?? process.env.AUTH_PUBLIC_PROFILE_ID ?? 2)
    const sessionProfileId = Number(
        opts.sessionProfileId ?? process.env.AUTH_SESSION_PROFILE_ID ?? 1
    )

    const registerBoDefault = tty
    const registerBo = Boolean(opts.registerBo) || (opts.registerBo == null && registerBoDefault)
    const txStart = opts.txStart != null ? Number(opts.txStart) : undefined

    const seedPublicAuthPermsEnv = envBool(process.env.AUTH_SEED_PUBLIC_AUTH_PERMS)
    const seedPublicAuthPermsOpt = opts.seedPublicAuthPerms === true
    const seedPublicAuthPerms = seedPublicAuthPermsOpt || seedPublicAuthPermsEnv === true

    const sql = []
    sql.push(...sqlSecuritySchemaBase())
    if (includeEmail) sql.push(...sqlSecurityOptionalEmail())
    sql.push(...sqlSecurityOperationalColumnsAndAudit())
    if (authEnable) {
        sql.push(...sqlAuthUserIdentifierTweaks({ authUsername }))
        sql.push(...sqlAuthTables())
        if (authLogin2StepNewDevice) sql.push(...sqlAuthLogin2StepTables())
    }
    sql.push(...sqlSessionTable(sessionSchemaOpt ?? 'public', sessionTableOpt ?? 'session'))

    if (shouldPrint) {
        console.log('-- Generated by scripts/db-init.ts')
        console.log(sql.join('\n') + '\n')
        if (!shouldApply) return
    }

    if (!shouldApply) return

    const db = loadDbConfig()
    const client = new pg.Client(pgClientConfig(db))
    await client.connect()

    try {
        let printedProfileTips = false
        const info = await client.query(
            'select current_database() as db, inet_server_addr() as server_addr, inet_server_port() as server_port'
        )
        const dbName = info.rows?.[0]?.db
        const serverAddr = info.rows?.[0]?.server_addr
        const serverPort = info.rows?.[0]?.server_port

        if (!nonInteractive) {
            const rl = readline.createInterface({ input, output })
            try {
                console.log(`Connected to DB: ${dbName} @ ${serverAddr}:${serverPort}`)
                const ok = await promptYesNo(rl, 'Apply DB init statements?', true)
                if (!ok) return
            } finally {
                rl.close()
            }
        }

        await client.query('begin')
        for (const stmt of sql) {
            await client.query(stmt)
        }

        // If this is a fresh DB (no profiles exist yet), offer to create minimal profiles:
        // - public (anonymous) profile
        // - session (authenticated) profile
        const existingProfiles = await getProfileCount(client)
        if (existingProfiles === 0) {
            let doSeed = seedProfiles
            let pubId = publicProfileId
            let sessId = sessionProfileId

            if (!nonInteractive && tty) {
                const rl = readline.createInterface({ input, output })
                try {
                    console.log('No profiles found in security.profile.')
                    doSeed = await promptYesNo(
                        rl,
                        'Seed minimal profiles (public + session)?',
                        true
                    )
                    if (doSeed) {
                        const suggestedPublic = pubId === sessId ? 2 : pubId
                        pubId = Number(
                            await promptText(rl, 'Public profile_id', String(suggestedPublic))
                        )
                        sessId = Number(await promptText(rl, 'Session profile_id', String(sessId)))
                    }
                } finally {
                    rl.close()
                }
            }

            if (doSeed) {
                if (!Number.isInteger(pubId) || pubId <= 0)
                    throw new Error('publicProfileId must be a positive integer')
                if (!Number.isInteger(sessId) || sessId <= 0)
                    throw new Error('sessionProfileId must be a positive integer')
                if (pubId === sessId)
                    throw new Error('publicProfileId and sessionProfileId must be different')

                await ensureProfileNamed(client, { profileId: pubId, profileName: 'public' })
                await ensureProfileNamed(client, { profileId: sessId, profileName: 'session' })
                console.log(
                    `Seeded profiles: public(profile_id=${pubId}), session(profile_id=${sessId})`
                )
                printProfileEnvTips({ publicProfileId: pubId, sessionProfileId: sessId })
                printedProfileTips = true
            } else if (nonInteractive) {
                console.log(
                    'No profiles found; skipping profile seeding in non-interactive mode. Set AUTH_SEED_PROFILES=1 or pass --seedProfiles to seed minimal profiles.'
                )
            }
        }

        if (registerBo) {
            // Create profile ahead of time in case we want to grant perms, even if seedAdmin is off.
            await ensureProfile(client, profileId)
            await registerBOs(client, { repoRoot: process.cwd(), profileId, txStart })

            // Optional: grant public profile permissions for Auth public methods.
            // This keeps unauthenticated /toProccess scoped to these methods only.
            let doGrantPublicAuth = seedPublicAuthPerms
            if (!doGrantPublicAuth && !nonInteractive && tty) {
                const rl = readline.createInterface({ input, output })
                try {
                    doGrantPublicAuth = await promptYesNo(
                        rl,
                        `Grant public profile_id=${publicProfileId} permissions for Auth public methods (register/email verification/password reset)?`,
                        false
                    )
                } finally {
                    rl.close()
                }
            }

            if (doGrantPublicAuth) {
                if (!Number.isInteger(publicProfileId) || publicProfileId <= 0) {
                    throw new Error('publicProfileId must be a positive integer')
                }
                await grantPublicAuthRegisterPerms(client, { publicProfileId })
                await grantPublicAuthResetPerms(client, { publicProfileId })
                if (!printedProfileTips) {
                    printProfileEnvTips({ publicProfileId, sessionProfileId })
                    printedProfileTips = true
                }
            }
        }

        if (seedAdmin) {
            let adminPassword = opts.adminPassword
            if (!adminPassword && !nonInteractive) {
                const rl = readline.createInterface({ input, output })
                try {
                    adminPassword = await promptText(rl, `Admin password for "${adminUser}"`, '')
                } finally {
                    rl.close()
                }
            }

            if (!adminPassword || String(adminPassword).length < 8) {
                throw new Error(
                    'Admin password is required (min 8 chars). Provide --adminPassword or run interactively.'
                )
            }

            const adminHash = await bcrypt.hash(String(adminPassword), 10)
            const { userId } = await ensureAdminUser(client, { profileId, adminUser, adminHash })
            console.log(
                `Seeded admin user: user_id=${userId}, user_na=${adminUser}, profile_id=${profileId}`
            )
        }

        await client.query('commit')
        console.log('DB init complete.')
        console.log(
            `Session table: ${sessionSchemaOpt ?? 'public'}.${sessionTableOpt ?? 'session'}`
        )
        if (includeEmail) console.log('Optional column enabled: security.user.user_em')
        if (registerBo)
            console.log(`BO methods auto-registered and granted to profile_id=${profileId}`)
    } catch (err) {
        try {
            await client.query('rollback')
        } catch {}
        console.error('DB init failed:', err?.message || err)
        process.exitCode = 1
    } finally {
        await client.end()
    }
}

export {
    // small helpers
    envBool,
    envInt,
    parseArgs,
    isTty,
    normalizeSchemaName,
    normalizeTableName,
    // SQL generators
    sqlSecuritySchemaBase,
    sqlSecurityOptionalEmail,
    sqlSecurityOperationalColumnsAndAudit,
    sqlAuthUserIdentifierTweaks,
    sqlAuthTables,
    sqlAuthLogin2StepTables,
    sqlSessionTable,
    // BO parsing
    parseAsyncMethodsFromBO,
    discoverBOs,
}

function isMainModule() {
    try {
        const entry = process.argv?.[1]
        if (!entry) return false
        return import.meta.url === pathToFileURL(entry).href
    } catch {
        return false
    }
}

if (isMainModule()) {
    await main()
}
