import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const repoRoot = path.resolve(process.cwd())

test('db-init --print generates expected SQL without touching DB', () => {
    const r = spawnSync(
        process.execPath,
        [
            '--import',
            'tsx',
            path.join(repoRoot, 'scripts', 'db-init.ts'),
            '--print',
            '--yes',
            '--includeEmail',
            '--sessionSchema',
            'security',
            '--sessionTable',
            'sessions',
        ],
        { encoding: 'utf8' }
    )

    assert.equal(r.status, 0, r.stderr || r.stdout)
    const out = (r.stdout || '') + (r.stderr || '')

    assert.match(out, /create schema if not exists security;/)
    assert.match(out, /create table if not exists security\.users/)
    assert.match(out, /alter table security\.users add column if not exists email/)

    // Session table under security schema
    assert.match(out, /create table if not exists security\.sessions/)

    // Note: db-init does not create project/domain schemas (only security + sessions)
})

test('db-init --print --auth includes auth tables (and optional 2-step login tables)', () => {
    const r = spawnSync(
        process.execPath,
        [
            '--import',
            'tsx',
            path.join(repoRoot, 'scripts', 'db-init.ts'),
            '--print',
            '--yes',
            '--auth',
            '--authLogin2StepNewDevice',
        ],
        { encoding: 'utf8' }
    )

    assert.equal(r.status, 0, r.stderr || r.stdout)
    const out = (r.stdout || '') + (r.stderr || '')

    // auth implies email column (identifier default is email)
    assert.match(out, /alter table security\.users add column if not exists email/)

    // auth tables
    assert.match(out, /create table if not exists security\.password_resets/)
    assert.match(out, /create table if not exists security\.one_time_codes/)

    // new-device 2-step login tables
    assert.match(out, /create table if not exists security\.user_devices/)
    assert.match(out, /create table if not exists security\.login_challenges/)
})
