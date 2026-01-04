import 'dotenv/config'

import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import pg from 'pg'
import bcrypt from 'bcryptjs'
import { createRequire } from 'node:module'
import { errorMessage } from '../src/helpers/error.js'
import { getAuthPresetFiles } from './bo-auth-preset.js'

const require = createRequire(import.meta.url)

type DbInitOptValue = string | boolean
type DbInitOpts = Record<string, DbInitOptValue>

function envBool(value: unknown): boolean | undefined {
    if (value == null) return undefined
    const v = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
    return undefined
}

function envInt(value: unknown): number | undefined {
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

function isTty(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function normalizeSchemaName(value: unknown): string | undefined {
    const s = String(value ?? '').trim()
    return s.length > 0 ? s : undefined
}

function normalizeTableName(value: unknown): string | undefined {
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

    --sessionSchema <name>  Session table schema (default: security)
    --sessionTable <name>   Session table name (default: sessions)

    --includeEmail          Add optional security.users.email column
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

    --registerBo            Auto-register BO methods into security.methods (default in TTY)
	--txStart <n>           Starting tx for new methods (default: max(tx)+1)

Auth (optional module):
    --auth                  Create auth support tables (password reset + OTP)
    --authUsername           Keep username as a supported identifier (default: true)
                                                     When false, username becomes optional (nullable).
    --authLoginId <value>    Login identifier: email|username (default: email)
    --authLogin2StepNewDevice  Require email verification on login from a new device

Auth BO (optional generation):
    --authBo                Generate Auth BO preset files under ./BO/Auth
    --authBoForce           Overwrite Auth BO preset files if they already exist
    --authBoSkip            Never generate/prompt for Auth BO preset files

Environment equivalents:
    AUTH_ENABLE=1            Same as --auth
    AUTH_USERNAME=1|0        Same as --authUsername
    AUTH_LOGIN_ID=email|username
    AUTH_LOGIN_2STEP_NEW_DEVICE=1|0

    AUTH_BO=1                Same as --authBo
    AUTH_BO_FORCE=1          Same as --authBoForce
    AUTH_BO_SKIP=1           Same as --authBoSkip

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

function pgClientConfig(db: any) {
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
    // Best-effort idempotent renames from legacy names to conventional names.
    // This lets db:init be run on an existing DB without ending up with duplicate schemas.
    const legacyRenames = [
        // Tables
        `do $$ begin
    if to_regclass('security.profile') is not null and to_regclass('security.profiles') is null then
        alter table security.profile rename to profiles;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security."user"') is not null and to_regclass('security.users') is null then
        alter table security."user" rename to users;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.user_profile') is not null and to_regclass('security.user_profiles') is null then
        alter table security.user_profile rename to user_profiles;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.object') is not null and to_regclass('security.objects') is null then
        alter table security.object rename to objects;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.method') is not null and to_regclass('security.methods') is null then
        alter table security.method rename to methods;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.permission_method') is not null and to_regclass('security.permission_methods') is null then
        alter table security.permission_method rename to permission_methods;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.audit_log') is not null and to_regclass('security.audit_logs') is null then
        alter table security.audit_log rename to audit_logs;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.password_reset') is not null and to_regclass('security.password_resets') is null then
        alter table security.password_reset rename to password_resets;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.one_time_code') is not null and to_regclass('security.one_time_codes') is null then
        alter table security.one_time_code rename to one_time_codes;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.user_device') is not null and to_regclass('security.user_devices') is null then
        alter table security.user_device rename to user_devices;
    end if;
end $$;`,
        `do $$ begin
    if to_regclass('security.login_challenge') is not null and to_regclass('security.login_challenges') is null then
        alter table security.login_challenge rename to login_challenges;
    end if;
end $$;`,

        // Columns (users)
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='users' and column_name='user_na')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='users' and column_name='username') then
        alter table security.users rename column user_na to username;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='users' and column_name='user_pw')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='users' and column_name='password') then
        alter table security.users rename column user_pw to password;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='users' and column_name='password_hash')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='users' and column_name='password') then
        alter table security.users rename column password_hash to password;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='users' and column_name='user_em')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='users' and column_name='email') then
        alter table security.users rename column user_em to email;
    end if;
end $$;`,

        // Columns (profiles)
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='profiles' and column_name='profile_na')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='profiles' and column_name='profile_name') then
        alter table security.profiles rename column profile_na to profile_name;
    end if;
end $$;`,

        // Columns (objects)
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='objects' and column_name='object_na')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='objects' and column_name='object_name') then
        alter table security.objects rename column object_na to object_name;
    end if;
end $$;`,

        // Columns (methods)
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='methods' and column_name='method_na')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='methods' and column_name='method_name') then
        alter table security.methods rename column method_na to method_name;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='methods' and column_name='tx_nu')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='methods' and column_name='tx') then
        alter table security.methods rename column tx_nu to tx;
    end if;
end $$;`,

        // Columns (audit_logs)
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='audit_logs' and column_name='time')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='audit_logs' and column_name='created_at') then
        alter table security.audit_logs rename column time to created_at;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='audit_logs' and column_name='object_na')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='audit_logs' and column_name='object_name') then
        alter table security.audit_logs rename column object_na to object_name;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='audit_logs' and column_name='method_na')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='audit_logs' and column_name='method_name') then
        alter table security.audit_logs rename column method_na to method_name;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='audit_logs' and column_name='tx_nu')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='audit_logs' and column_name='tx') then
        alter table security.audit_logs rename column tx_nu to tx;
    end if;
end $$;`,

        // Columns (auth ids)
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='password_resets' and column_name='reset_id')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='password_resets' and column_name='password_reset_id') then
        alter table security.password_resets rename column reset_id to password_reset_id;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='one_time_codes' and column_name='code_id')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='one_time_codes' and column_name='one_time_code_id') then
        alter table security.one_time_codes rename column code_id to one_time_code_id;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='user_devices' and column_name='device_id')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='user_devices' and column_name='user_device_id') then
        alter table security.user_devices rename column device_id to user_device_id;
    end if;
end $$;`,
        `do $$ begin
    if exists (select 1 from information_schema.columns where table_schema='security' and table_name='login_challenges' and column_name='challenge_id')
         and not exists (select 1 from information_schema.columns where table_schema='security' and table_name='login_challenges' and column_name='login_challenge_id') then
        alter table security.login_challenges rename column challenge_id to login_challenge_id;
    end if;
end $$;`,
    ]

    return [
        `create schema if not exists security;`,
        ...legacyRenames,
        `create table if not exists security.profiles (\n  profile_id bigint generated by default as identity primary key\n);`,
        `create table if not exists security.users (\n  user_id bigint generated by default as identity primary key,\n  username text not null unique,\n  password text not null\n);`,
        `create table if not exists security.user_profiles (\n  user_id bigint not null references security.users(user_id) on delete cascade,\n  profile_id bigint not null references security.profiles(profile_id) on delete cascade,\n  primary key (user_id, profile_id)\n);`,
        // Runtime expects a single effective profile per user (Auth.register uses ON CONFLICT (user_id)).
        // Enforce that with a unique index; dedupe first if upgrading an existing DB.
        `do $$ begin
    if to_regclass('security.user_profiles') is not null then
        delete from security.user_profiles a
        using security.user_profiles b
        where a.user_id = b.user_id and a.ctid < b.ctid;
    end if;
end $$;`,
        `create unique index if not exists uq_user_profiles_user_id on security.user_profiles(user_id);`,
        `create table if not exists security.objects (\n  object_id bigint generated by default as identity primary key,\n  object_name text not null unique\n);`,
        `create table if not exists security.methods (\n  method_id bigint generated by default as identity primary key,\n  object_id bigint not null references security.objects(object_id) on delete cascade,\n  method_name text not null,\n  tx integer not null,\n  constraint uq_method_object unique (object_id, method_name),\n  constraint uq_method_tx unique (tx),\n  constraint ck_method_tx_positive check (tx > 0)\n);`,
        `create table if not exists security.permission_methods (\n  profile_id bigint not null references security.profiles(profile_id) on delete cascade,\n  method_id bigint not null references security.methods(method_id) on delete cascade,\n  primary key (profile_id, method_id)\n);`,
        `create index if not exists ix_user_profiles_profile_id on security.user_profiles(profile_id);`,
        `create index if not exists ix_methods_object_id on security.methods(object_id);`,
        `create index if not exists ix_permission_methods_method_id on security.permission_methods(method_id);`,
    ]
}

function sqlSecurityOptionalEmail() {
    return [
        `alter table security.users add column if not exists email text;`,
        `alter table security.users add column if not exists email_verified_at timestamptz;`,
        `create unique index if not exists uq_users_email on security.users(email) where email is not null;`,
    ]
}

function sqlAuthUserIdentifierTweaks({ authUsername }: { authUsername: boolean }) {
    // If username support is disabled, allow user_na to be nullable.
    // NOTE: unique constraints already allow multiple NULLs in Postgres.
    if (authUsername) return []
    return [`alter table security.users alter column username drop not null;`]
}

function sqlAuthTables() {
    return [
        `create table if not exists security.password_resets (
  password_reset_id bigint generated by default as identity primary key,
  user_id bigint not null references security.users(user_id) on delete cascade,
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
        `create unique index if not exists uq_password_resets_token_hash on security.password_resets(token_hash);`,
        `create index if not exists ix_password_resets_user_id on security.password_resets(user_id);`,
        `create index if not exists ix_password_resets_expires_at on security.password_resets(expires_at);`,

        `create table if not exists security.one_time_codes (
  one_time_code_id bigint generated by default as identity primary key,
  user_id bigint not null references security.users(user_id) on delete cascade,
  purpose text not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  meta jsonb
);`,
        `create index if not exists ix_one_time_codes_user_purpose on security.one_time_codes(user_id, purpose, created_at desc);`,
        `create index if not exists ix_one_time_codes_expires_at on security.one_time_codes(expires_at);`,
    ]
}

function sqlSecurityOperationalColumnsAndAudit() {
    return [
        // Conventional operational columns
        `alter table security.profiles add column if not exists profile_name text;`,
        `create unique index if not exists uq_profiles_profile_name on security.profiles(profile_name) where profile_name is not null;`,

        `alter table security.users add column if not exists is_active boolean not null default true;`,
        `alter table security.users add column if not exists created_at timestamptz not null default now();`,
        `alter table security.users add column if not exists updated_at timestamptz not null default now();`,
        `alter table security.users add column if not exists last_login_at timestamptz;`,

        // Safe, low-risk constraints (idempotent via DO blocks)
        `do $$ begin\n  alter table security.methods add constraint ck_method_tx_positive check (tx > 0);\nexception when duplicate_object then null; end $$;`,
        `do $$ begin\n  alter table security.users add constraint ck_users_username_not_blank check (length(btrim(username)) > 0);\nexception when duplicate_object then null; end $$;`,

        // Audit log (optional to write to, but table is cheap and useful)
        `create table if not exists security.audit_logs (\n  audit_id bigint generated by default as identity primary key,\n  created_at timestamptz not null default now(),\n  request_id text,\n  user_id bigint,\n  profile_id bigint,\n  action text not null,\n  object_name text,\n  method_name text,\n  tx integer,\n  meta jsonb\n);`,
        `create index if not exists ix_audit_logs_created_at on security.audit_logs(created_at desc);`,
        `create index if not exists ix_audit_logs_user_id on security.audit_logs(user_id);`,
        `create index if not exists ix_audit_logs_action on security.audit_logs(action);`,
    ]
}

function sqlSessionTable(schemaName: string | undefined, tableName: string | undefined) {
    const schema = schemaName ?? 'security'
    const table = tableName ?? 'sessions'
    const qualified = schema === 'public' ? `public.${table}` : `${schema}.${table}`
    const prelude = schema !== 'public' ? [`create schema if not exists ${schema};`] : []
    const legacyRename =
        table === 'sessions'
            ? [
                  `do $$ begin\n  if to_regclass('${schema}.session') is not null and to_regclass('${schema}.sessions') is null then\n    alter table ${schema}.session rename to sessions;\n  end if;\nend $$;`,
              ]
            : []
    return [
        ...prelude,
        ...legacyRename,
        `create table if not exists ${qualified} (\n  sid varchar not null primary key,\n  sess json not null,\n  expire timestamp(6) not null\n);`,
        `create index if not exists ${table}_expire_idx on ${qualified} (expire);`,
    ]
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p)
        return true
    } catch {
        return false
    }
}

function parseAsyncMethodsFromBO(fileContent: string): string[] {
    // We only want business methods defined as `async name(...)`.
    const methods = new Set<string>()
    const re = /\basync\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(fileContent)) != null) {
        const name = m[1]
        if (!name) continue
        if (name === 'constructor') continue
        if (name.startsWith('_')) continue
        methods.add(name)
    }
    return Array.from(methods)
}

async function discoverBOs(repoRoot: string) {
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

async function ensureProfile(client: any, profileId: number) {
    await client.query(
        'insert into security.profiles (profile_id) values ($1) on conflict (profile_id) do nothing',
        [profileId]
    )
}

async function ensureProfileNamed(
    client: any,
    { profileId, profileName }: { profileId: number; profileName: string }
) {
    // Only set name if it's currently NULL to avoid overwriting existing meaning.
    await client.query(
        'insert into security.profiles (profile_id, profile_name) values ($1, $2) on conflict (profile_id) do update set profile_name = coalesce(security.profiles.profile_name, excluded.profile_name)',
        [profileId, profileName]
    )
}

async function getProfileCount(client: any) {
    const r = await client.query('select count(*)::int as n from security.profiles')
    return Number(r.rows?.[0]?.n ?? 0)
}

async function getNextTxFromDb(client: any) {
    const r = await client.query('select coalesce(max(tx), 0) + 1 as next_tx from security.methods')
    return Number(r.rows?.[0]?.next_tx)
}

async function upsertObject(client: any, objectName: string) {
    const r = await client.query(
        'insert into security.objects (object_name) values ($1) on conflict (object_name) do update set object_name = excluded.object_name returning object_id',
        [objectName]
    )
    const objectId = r.rows?.[0]?.object_id
    if (!objectId) throw new Error(`Failed to upsert security.objects for ${objectName}`)
    return objectId
}

async function upsertMethodKeepTx(
    client: any,
    { objectId, methodName, txNu }: { objectId: number; methodName: string; txNu: number }
) {
    // If the method already exists, keep existing tx (don't overwrite contracts).
    const r = await client.query(
        `insert into security.methods (object_id, method_name, tx)
		 values ($1, $2, $3)
		 on conflict (object_id, method_name)
		 do update set tx = security.methods.tx
		 returning method_id, tx`,
        [objectId, methodName, txNu]
    )
    const row = r.rows?.[0]
    if (!row?.method_id) throw new Error(`Failed to upsert security.methods for ${methodName}`)
    return { methodId: row.method_id, txNu: Number(row.tx) }
}

async function grantPermission(
    client: any,
    { profileId, methodId }: { profileId: number; methodId: number }
) {
    await client.query(
        'insert into security.permission_methods (profile_id, method_id) values ($1, $2) on conflict (profile_id, method_id) do nothing',
        [profileId, methodId]
    )
}

async function resolveMethodIdByName(
    client: any,
    { objectName, methodName }: { objectName: string; methodName: string }
) {
    const r = await client.query(
        `select m.method_id
         from security.methods m
         inner join security.objects o on o.object_id = m.object_id
         where o.object_name = $1 and m.method_name = $2`,
        [objectName, methodName]
    )
    return r.rows?.[0]?.method_id ?? null
}

async function grantPublicAuthResetPerms(
    client: any,
    { publicProfileId }: { publicProfileId: number }
) {
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

async function grantPublicAuthRegisterPerms(
    client: any,
    { publicProfileId }: { publicProfileId: number }
) {
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

function printProfileEnvTips({
    publicProfileId,
    sessionProfileId,
}: {
    publicProfileId: number | null
    sessionProfileId: number | null
}) {
    console.log('---')
    console.log('Server config tips:')
    if (publicProfileId != null) console.log(`- Set AUTH_PUBLIC_PROFILE_ID=${publicProfileId}`)
    if (sessionProfileId != null)
        console.log(`- (Optional) Set AUTH_SESSION_PROFILE_ID=${sessionProfileId}`)
    console.log('---')
}

async function writeFileSafe(
    filePath: string,
    content: string,
    force: boolean
): Promise<'written' | 'skipped'> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    try {
        if (force) {
            await fs.writeFile(filePath, content)
            return 'written'
        }

        await fs.writeFile(filePath, content, { flag: 'wx' })
        return 'written'
    } catch (err: any) {
        if (!force && err?.code === 'EEXIST') return 'skipped'
        throw err
    }
}

async function registerBOs(
    client: any,
    {
        repoRoot,
        profileId,
        txStart,
    }: { repoRoot: string; profileId: number; txStart: number | null }
) {
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
                } catch (err: unknown) {
                    const msg = errorMessage(err)
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

async function promptYesNo(rl: any, question: string, defaultYes = false) {
    const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] '
    const ans = String(await rl.question(question + suffix))
        .trim()
        .toLowerCase()
    if (!ans) return defaultYes
    return ['y', 'yes'].includes(ans)
}

async function promptChoice(rl: any, question: string, choices: unknown[], defaultValue: unknown) {
    const normalized = choices.map((c: unknown) => String(c).trim().toLowerCase())
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

async function ensureAdminUser(
    client: any,
    { profileId, adminUser, adminHash }: { profileId: number; adminUser: string; adminHash: string }
) {
    await client.query(
        'insert into security.profiles (profile_id) values ($1) on conflict (profile_id) do nothing',
        [profileId]
    )

    const userResult = await client.query(
        'insert into security.users (username, password) values ($1, $2) on conflict (username) do update set password = excluded.password returning user_id',
        [adminUser, adminHash]
    )
    const userId = userResult.rows?.[0]?.user_id
    if (!userId) throw new Error('Failed to upsert admin user')

    await client.query(
        'insert into security.user_profiles (user_id, profile_id) values ($1, $2) on conflict (user_id, profile_id) do nothing',
        [userId, profileId]
    )

    return { userId, profileId }
}

function sqlAuthLogin2StepTables() {
    return [
        `create table if not exists security.user_devices (
    user_device_id bigint generated by default as identity primary key,
    user_id bigint not null references security.users(user_id) on delete cascade,
    device_token_hash text not null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    label text,
    user_agent text,
    ip inet,
    meta jsonb
);`,
        `create unique index if not exists uq_user_devices_token_hash on security.user_devices(device_token_hash);`,
        `create index if not exists ix_user_devices_user_id on security.user_devices(user_id);`,
        `create index if not exists ix_user_devices_active on security.user_devices(user_id) where revoked_at is null;`,

        `create table if not exists security.login_challenges (
    login_challenge_id bigint generated by default as identity primary key,
    user_id bigint not null references security.users(user_id) on delete cascade,
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
        `create unique index if not exists uq_login_challenges_token_hash on security.login_challenges(token_hash);`,
        `create index if not exists ix_login_challenges_user_id on security.login_challenges(user_id);`,
        `create index if not exists ix_login_challenges_expires_at on security.login_challenges(expires_at);`,
    ]
}
async function main() {
    const { opts } = parseArgs(process.argv.slice(2))
    if (opts.help) return printHelp()

    const tty = isTty()
    const nonInteractive = Boolean(opts.yes) || !tty

    const shouldPrint = Boolean(opts.print)
    const shouldApply = Boolean(opts.apply) || (!shouldPrint && tty)

    const sessionSchemaSpecified = opts.sessionSchema != null || process.env.SESSION_SCHEMA != null
    const sessionTableSpecified = opts.sessionTable != null || process.env.SESSION_TABLE != null
    let sessionSchemaOpt = normalizeSchemaName(
        opts.sessionSchema ?? process.env.SESSION_SCHEMA ?? 'security'
    )
    let sessionTableOpt = normalizeTableName(
        opts.sessionTable ?? process.env.SESSION_TABLE ?? 'sessions'
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

    const authBoEnv = envBool(process.env.AUTH_BO)
    const authBoForceEnv = envBool(process.env.AUTH_BO_FORCE)
    const authBoSkipEnv = envBool(process.env.AUTH_BO_SKIP)

    const authBoOpt = opts.authBo === true
    const authBoForceOpt = opts.authBoForce === true
    const authBoSkipOpt = opts.authBoSkip === true

    const authBo = authBoOpt || authBoEnv === true
    const authBoForce = authBoForceOpt || authBoForceEnv === true
    const authBoSkip = authBoSkipOpt || authBoSkipEnv === true

    // Interactive prompts (only in TTY and when not forced non-interactive)
    if (!nonInteractive && tty) {
        const rl = readline.createInterface({ input, output })
        try {
            if (!sessionSchemaSpecified) {
                sessionSchemaOpt = normalizeSchemaName(
                    await promptText(rl, 'Session schema', sessionSchemaOpt ?? 'security')
                )
            }
            if (!sessionTableSpecified) {
                sessionTableOpt = normalizeTableName(
                    await promptText(rl, 'Session table', sessionTableOpt ?? 'sessions')
                )
            }

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
                        'Also support unique username (username)?',
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

    const includeEmailOpt = Boolean(opts.includeEmail)
    let includeEmail = includeEmailOpt || authEnable || authLoginId === 'email'
    const includeEmailImplied = authEnable || authLoginId === 'email'

    if (!nonInteractive && tty && !includeEmailImplied && !includeEmailOpt) {
        const rl = readline.createInterface({ input, output })
        try {
            includeEmail = await promptYesNo(
                rl,
                'Include optional security.user.user_em column?',
                false
            )
        } finally {
            rl.close()
        }
    }

    const seedAdminDefault = tty
    let seedAdmin = Boolean(opts.seedAdmin) || (opts.seedAdmin == null && seedAdminDefault)
    const adminUser = String(opts.adminUser ?? 'admin')
    const profileId = Number(opts.profileId ?? 1)

    if (!nonInteractive && tty && opts.seedAdmin == null) {
        const rl = readline.createInterface({ input, output })
        try {
            seedAdmin = await promptYesNo(rl, 'Seed admin user?', true)
        } finally {
            rl.close()
        }
    }

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
    let registerBo = Boolean(opts.registerBo) || (opts.registerBo == null && registerBoDefault)
    let txStart = opts.txStart != null ? Number(opts.txStart) : undefined

    if (!nonInteractive && tty && opts.registerBo == null) {
        const rl = readline.createInterface({ input, output })
        try {
            registerBo = await promptYesNo(
                rl,
                'Auto-register BO methods into security.methods?',
                true
            )
        } finally {
            rl.close()
        }
    }

    if (!nonInteractive && tty && registerBo && opts.txStart == null) {
        const rl = readline.createInterface({ input, output })
        try {
            const ans = String(
                await rl.question('Starting tx for new BO methods (blank = auto): ')
            ).trim()
            if (ans.length > 0) {
                const n = Number(ans)
                if (Number.isFinite(n)) txStart = n
            }
        } finally {
            rl.close()
        }
    }

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
    sql.push(...sqlSessionTable(sessionSchemaOpt ?? 'security', sessionTableOpt ?? 'sessions'))

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
                    console.log('No profiles found in security.profiles.')
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

        // Optional: generate Auth BO preset when auth is enabled and BO registration is on.
        // This keeps db:init self-contained when it offers public Auth permissions.
        if (authEnable && registerBo && !authBoSkip) {
            const authBoPath = path.join(process.cwd(), 'BO', 'Auth', 'AuthBO.ts')
            let authBoExists = true
            try {
                await fs.access(authBoPath)
            } catch {
                authBoExists = false
            }

            let doGenerate = false
            let forceOverwrite = false

            if (authBo) {
                doGenerate = true
                forceOverwrite = authBoForce
            } else if (!authBoExists && nonInteractive) {
                // In --yes mode, assume yes if Auth BO is missing.
                doGenerate = true
                forceOverwrite = false
            } else if (!nonInteractive && tty) {
                const rl = readline.createInterface({ input, output })
                try {
                    if (!authBoExists) {
                        doGenerate = await promptYesNo(
                            rl,
                            'Auth BO not found under ./BO/Auth. Generate Auth BO preset now?',
                            true
                        )
                        forceOverwrite = false
                    } else {
                        doGenerate = await promptYesNo(
                            rl,
                            'Auth BO already exists under ./BO/Auth. Regenerate/overwrite Auth BO preset files?',
                            false
                        )
                        forceOverwrite = authBoForce || doGenerate
                    }
                } finally {
                    rl.close()
                }
            }

            if (doGenerate) {
                const files = getAuthPresetFiles(process.cwd())
                let written = 0
                let skipped = 0
                for (const f of files) {
                    const r = await writeFileSafe(f.p, f.c, forceOverwrite)
                    if (r === 'written') written++
                    else skipped++
                }
                console.log(
                    `Auth BO preset generation complete: written=${written}, skipped=${skipped}, overwrite=${forceOverwrite}`
                )
            }
        }

        if (registerBo) {
            // Create profile ahead of time in case we want to grant perms, even if seedAdmin is off.
            await ensureProfile(client, profileId)
            await registerBOs(client, {
                repoRoot: process.cwd(),
                profileId,
                txStart: txStart ?? null,
            })

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
            let adminPassword: string | undefined =
                typeof opts.adminPassword === 'string' ? opts.adminPassword : undefined
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
            `Session table: ${sessionSchemaOpt ?? 'security'}.${sessionTableOpt ?? 'sessions'}`
        )
        if (includeEmail) console.log('Optional column enabled: security.user.user_em')
        if (registerBo)
            console.log(`BO methods auto-registered and granted to profile_id=${profileId}`)
    } catch (err: unknown) {
        try {
            await client.query('rollback')
        } catch {}
        console.error('DB init failed:', errorMessage(err))
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
