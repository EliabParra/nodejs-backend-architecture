import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'

import Dispatcher from '../src/BSS/Dispatcher.js'
import { csrfProtection } from '../src/express/middleware/csrf.js'

import { withGlobals } from './_helpers/global-state.mjs'

const GLOBAL_KEYS = ['config', 'msgs', 'log', 'db', 'security', 'v']

function makeTestMsgs() {
    const client = {
        unknown: { code: 500, msg: 'Unknown' },
        invalidParameters: { code: 400, msg: 'Invalid parameters' },
        login: { code: 401, msg: 'Login required' },
        permissionDenied: { code: 403, msg: 'Permission denied' },
        serviceUnavailable: { code: 503, msg: 'Service unavailable' },
        csrfInvalid: { code: 403, msg: 'CSRF invalid' },
        tooManyRequests: { code: 429, msg: 'Too many requests' },
    }

    const server = {
        serverError: { code: 500, msg: 'Server error' },
        dbError: { code: 500, msg: 'DB error' },
        txNotFound: { code: 500, msg: 'tx not found {tx}' },
    }

    const success = {
        ok: { code: 200, msg: 'OK' },
    }

    return {
        en: {
            alerts: { paramsType: 'Invalid type at {value}' },
            errors: { client, server },
            success,
        },
    }
}

function makeValidatorStub() {
    return {
        getMessage: (kind, { label, min } = {}) => {
            if (kind === 'length') return `${label} length must be >= ${min}`
            return `${label} must be ${kind}`
        },
        validateString: ({ value, label }) => {
            if (typeof value === 'string') return true
            globalThis.__alerts ??= []
            globalThis.__alerts.push({ label, kind: 'string' })
            return false
        },
        validateLength: ({ value, label }, min, max) => {
            if (typeof value === 'string' && value.length >= min && value.length <= max) return true
            globalThis.__alerts ??= []
            globalThis.__alerts.push({ label, kind: 'length' })
            return false
        },
        validateEmail: ({ value, label }) => {
            if (typeof value === 'string' && value.includes('@')) return true
            globalThis.__alerts ??= []
            globalThis.__alerts.push({ label, kind: 'email' })
            return false
        },
        getAlerts: () => globalThis.__alerts ?? [],
    }
}

test('password reset works via /toProccess without session (public profile)', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        const repoRoot = path.resolve(__dirname, '..')

        // Ensure BO/Auth exists so we can import and execute the real AuthBO.
        // Do not delete it during tests.
        const authBoPath = path.join(repoRoot, 'BO', 'Auth', 'AuthBO.ts')
        const hasAuthBo = await (async () => {
            try {
                await fs.stat(authBoPath)
                return true
            } catch {
                return false
            }
        })()
        if (!hasAuthBo) {
            const gen = spawnSync(
                process.execPath,
                ['--import', 'tsx', 'scripts/bo.ts', 'auth', '--force'],
                {
                    cwd: repoRoot,
                    encoding: 'utf8',
                }
            )
            assert.equal(gen.status, 0, gen.stderr || gen.stdout)
        }

        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()

        // Public (anonymous) profile id used when there is no session.
        const PUBLIC_PROFILE_ID = 999

        globalThis.config = {
            app: { lang: 'en', name: 'app', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: {
                secret: 'test-secret',
                resave: false,
                saveUninitialized: true,
                cookie: { secure: false, sameSite: 'lax' },
                store: { type: 'pg', schemaName: 'public', tableName: 'session' },
            },
            bo: { path: '../../BO/' },
            auth: {
                publicProfileId: PUBLIC_PROFILE_ID,
                passwordResetExpiresSeconds: 900,
                passwordResetMaxAttempts: 5,
                passwordResetPurpose: 'password_reset',
            },
            email: { mode: 'log', from: 'no-reply@example.com', logIncludeSecrets: true },
        }

        let lastEmail = null
        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: ({ msg, ctx }) => {
                if (typeof msg === 'string' && msg.includes('Would send password reset')) {
                    lastEmail = ctx
                }
            },
        }

        // Minimal fake Security that matches Dispatcher expectations.
        const txMap = new Map([
            [1, { object_na: 'Auth', method_na: 'requestPasswordReset' }],
            [2, { object_na: 'Auth', method_na: 'verifyPasswordReset' }],
            [3, { object_na: 'Auth', method_na: 'resetPassword' }],
        ])

        const { AuthBO } = await import('../BO/Auth/AuthBO.ts')
        const auth = new AuthBO()

        globalThis.security = {
            isReady: true,
            ready: Promise.resolve(true),
            getDataTx: (tx) => txMap.get(tx) ?? false,
            getPermissions: ({ profile_id, object_na, method_na }) => {
                if (profile_id !== PUBLIC_PROFILE_ID) return false
                if (object_na !== 'Auth') return false
                return ['requestPasswordReset', 'verifyPasswordReset', 'resetPassword'].includes(
                    method_na
                )
            },
            executeMethod: async ({ method_na, params }) => {
                return await auth[method_na](params)
            },
        }

        // DB stub for Auth BO + audit.
        const state = {
            user: { user_id: 10, user_em: 'u@example.com', user_na: 'u' },
            reset: null,
            otp: null,
            passwordHash: null,
            invalidateCalls: 0,
            consumeCodesCalls: 0,
        }

        globalThis.db = {
            pool: {
                query: async () => ({ rows: [] }),
            },
            exeRaw: async (sql, params) => {
                state.exeRawCalls ??= []
                state.exeRawCalls.push([sql, params])
                return { rows: [] }
            },
            exe: async (schema, query, params) => {
                if (schema !== 'security') return { rows: [] }

                if (query === 'insertAuditLog') return { rows: [] }

                if (query === 'getUserByEmail') {
                    assert.deepEqual(params, [state.user.user_em])
                    return { rows: [state.user] }
                }
                if (query === 'getUserByUsername') return { rows: [] }

                if (query === 'invalidateActivePasswordResetsForUser') {
                    const [userId] = params
                    assert.equal(userId, state.user.user_id)
                    state.invalidateCalls += 1
                    // If there was a prior reset in state, mark it used.
                    if (state.reset && !state.reset.used_at) {
                        state.reset.used_at = new Date().toISOString()
                    }
                    return { rows: [] }
                }

                if (query === 'consumeOneTimeCodesForUserPurpose') {
                    const [userId, purpose] = params
                    assert.equal(userId, state.user.user_id)
                    assert.equal(purpose, 'password_reset')
                    state.consumeCodesCalls += 1
                    if (state.otp && !state.otp.consumed_at) {
                        state.otp.consumed_at = new Date().toISOString()
                    }
                    return { rows: [] }
                }

                if (query === 'insertPasswordReset') {
                    const [userId, tokenHash, sentTo, expiresSeconds, ip, userAgent] = params
                    assert.equal(userId, state.user.user_id)
                    assert.equal(sentTo, state.user.user_em)
                    assert.ok(typeof ip === 'string' && ip.length > 0)
                    assert.ok(
                        userAgent == null || (typeof userAgent === 'string' && userAgent.length > 0)
                    )
                    state.reset = {
                        reset_id: 1,
                        user_id: userId,
                        token_hash: tokenHash,
                        used_at: null,
                        attempt_count: 0,
                        expires_at: new Date(
                            Date.now() + Number(expiresSeconds) * 1000
                        ).toISOString(),
                    }
                    return { rows: [{ reset_id: 1 }] }
                }

                if (query === 'insertOneTimeCode') {
                    const [userId, purpose, codeHash, expiresSeconds, metaJson] = params
                    assert.equal(userId, state.user.user_id)
                    assert.equal(purpose, 'password_reset')
                    assert.ok(typeof metaJson === 'string')

                    const meta = JSON.parse(metaJson)
                    assert.ok(meta && typeof meta === 'object')
                    assert.ok(meta.request && typeof meta.request === 'object')
                    assert.ok(typeof meta.request.ip === 'string' && meta.request.ip.length > 0)
                    assert.ok(
                        meta.request.userAgent == null ||
                            (typeof meta.request.userAgent === 'string' &&
                                meta.request.userAgent.length > 0)
                    )

                    state.otp = {
                        code_id: 7,
                        user_id: userId,
                        purpose,
                        code_hash: codeHash,
                        expires_at: new Date(
                            Date.now() + Number(expiresSeconds) * 1000
                        ).toISOString(),
                        consumed_at: null,
                        attempt_count: 0,
                    }
                    return { rows: [{ code_id: 7 }] }
                }

                if (query === 'getPasswordResetByTokenHash') {
                    const [tokenHash] = params
                    if (!state.reset || tokenHash !== state.reset.token_hash) return { rows: [] }
                    return { rows: [state.reset] }
                }

                if (query === 'getValidOneTimeCodeForPurpose') {
                    const [userId, purpose, codeHash] = params
                    if (!state.otp) return { rows: [] }
                    if (userId !== state.otp.user_id) return { rows: [] }
                    if (purpose !== state.otp.purpose) return { rows: [] }
                    if (codeHash !== state.otp.code_hash) return { rows: [] }
                    if (state.otp.consumed_at) return { rows: [] }
                    const expiresAt = new Date(state.otp.expires_at)
                    if (expiresAt.getTime() <= Date.now()) return { rows: [] }
                    return { rows: [state.otp] }
                }

                if (query === 'incrementPasswordResetAttempt') {
                    if (state.reset)
                        state.reset.attempt_count = Number(state.reset.attempt_count ?? 0) + 1
                    return { rows: [] }
                }

                if (query === 'updateUserPassword') {
                    const [userId, passwordHash] = params
                    assert.equal(userId, state.user.user_id)
                    assert.ok(typeof passwordHash === 'string' && passwordHash.length > 0)
                    state.passwordHash = passwordHash
                    return { rows: [] }
                }

                if (query === 'consumeOneTimeCode') {
                    const [codeId] = params
                    assert.equal(codeId, state.otp.code_id)
                    state.otp.consumed_at = new Date().toISOString()
                    return { rows: [] }
                }

                if (query === 'markPasswordResetUsed') {
                    const [resetId] = params
                    assert.equal(resetId, state.reset.reset_id)
                    state.reset.used_at = new Date().toISOString()
                    return { rows: [] }
                }

                // Any other auth query defaults to empty.
                return { rows: [] }
            },
        }

        const dispatcher = new Dispatcher()
        dispatcher.app.post(
            '/toProccess',
            dispatcher.toProccessRateLimiter,
            dispatcher.authPasswordResetRateLimiter,
            csrfProtection,
            dispatcher.toProccess.bind(dispatcher)
        )

        const agent = request.agent(dispatcher.app)

        // 1) Request reset
        const r1 = await agent
            .post('/toProccess')
            .send({ tx: 1, params: { identifier: 'u@example.com' } })
        assert.equal(r1.status, 200)
        assert.equal(r1.body.code, 200)

        assert.ok(lastEmail && typeof lastEmail.token === 'string' && lastEmail.token.length > 0)
        assert.ok(lastEmail && typeof lastEmail.code === 'string' && lastEmail.code.length > 0)

        // Single-active-reset behavior: invalidation happens before creating the new reset.
        assert.equal(state.invalidateCalls, 1)
        assert.equal(state.consumeCodesCalls, 1)

        // 2) Verify token + code
        const r2 = await agent
            .post('/toProccess')
            .send({ tx: 2, params: { token: lastEmail.token, code: lastEmail.code } })
        assert.equal(r2.status, 200)
        assert.equal(r2.body.code, 200)

        // 3) Confirm reset (token + code + new password)
        const r3 = await agent.post('/toProccess').send({
            tx: 3,
            params: {
                token: lastEmail.token,
                code: lastEmail.code,
                newPassword: 'NewP@ssw0rd!!',
            },
        })
        assert.equal(r3.status, 200)
        assert.equal(r3.body.code, 200)

        assert.ok(typeof state.passwordHash === 'string' && state.passwordHash.length > 0)
        assert.ok(state.reset && state.reset.used_at)
        assert.ok(state.otp && state.otp.consumed_at)

        // Sessions invalidated (best-effort) after resetPassword.
        assert.ok(Array.isArray(state.exeRawCalls) && state.exeRawCalls.length >= 1)
        const last = state.exeRawCalls[state.exeRawCalls.length - 1]
        assert.ok(typeof last[0] === 'string' && last[0].toLowerCase().includes('delete from'))
        assert.deepEqual(last[1], [String(state.user.user_id)])

        // 4) Rate limiting: requestPasswordReset is capped (5/min). We already made 1 request above.
        for (let i = 0; i < 4; i++) {
            const ok = await agent
                .post('/toProccess')
                .send({ tx: 1, params: { identifier: 'u@example.com' } })
            assert.equal(ok.status, 200)
        }
        const limited = await agent
            .post('/toProccess')
            .send({ tx: 1, params: { identifier: 'u@example.com' } })
        assert.equal(limited.status, 429)

        // Intentionally no cleanup: do not delete workspace BOs.
    })
})
