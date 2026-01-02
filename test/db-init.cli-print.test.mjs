import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const repoRoot = path.resolve(process.cwd())

test('db-init --print generates expected SQL without touching DB', () => {
    const r = spawnSync(
        process.execPath,
        [
            path.join(repoRoot, 'scripts', 'db-init.mjs'),
            '--print',
            '--yes',
            '--includeEmail',
            '--sessionSchema',
            'security',
            '--sessionTable',
            'session',
        ],
        { encoding: 'utf8' }
    )

    assert.equal(r.status, 0, r.stderr || r.stdout)
    const out = (r.stdout || '') + (r.stderr || '')

    assert.match(out, /create schema if not exists security;/)
    assert.match(out, /create table if not exists security\."user"/)
    assert.match(out, /alter table security\."user" add column if not exists user_em/)

    // Session table under security schema
    assert.match(out, /create table if not exists security\.session/)

    // Note: db-init does not create project/domain schemas (only security + sessions)
})
