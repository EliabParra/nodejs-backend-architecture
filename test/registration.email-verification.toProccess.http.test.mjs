import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import bcrypt from 'bcryptjs'

import Dispatcher from '../src/BSS/Dispatcher.js'
import { createCsrfProtection, createCsrfTokenHandler } from '../src/express/middleware/csrf.js'

import { withGlobals } from './_helpers/global-state.mjs'

const GLOBAL_KEYS = ['config', 'msgs', 'log', 'db', 'security', 'v']

function makeTestMsgs() {
    const client = {
        unknown: { code: 500, msg: 'Unknown' },
        invalidParameters: { code: 400, msg: 'Invalid parameters' },
        login: { code: 401, msg: 'Login required' },
        sessionExists: { code: 409, msg: 'Session exists' },
        usernameOrPasswordIncorrect: { code: 401, msg: 'Bad credentials' },
        permissionDenied: { code: 403, msg: 'Permission denied' },
        serviceUnavailable: { code: 503, msg: 'Service unavailable' },
        csrfInvalid: { code: 403, msg: 'CSRF invalid' },
        tooManyRequests: { code: 429, msg: 'Too many requests' },
        emailRequired: { code: 409, msg: 'Email required' },
        emailNotVerified: { code: 403, msg: 'Email not verified' },
    }

    const server = {
        serverError: { code: 500, msg: 'Server error' },
        dbError: { code: 500, msg: 'DB error' },
        txNotFound: { code: 500, msg: 'tx not found {tx}' },
    }

    const success = {
        login: { code: 200, msg: 'Login ok' },
        register: { code: 201, msg: 'Registered' },
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

test('register requires email verification before login', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()

        const PUBLIC_PROFILE_ID = 999
        const SESSION_PROFILE_ID = 1

        globalThis.config = {
            app: { lang: 'en', name: 'app', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: {
                secret: 'test-secret',
                resave: false,
                saveUninitialized: true,
                cookie: { secure: false, sameSite: 'lax' },
            },
            bo: { path: '../../BO/' },
            auth: {
                publicProfileId: PUBLIC_PROFILE_ID,
                sessionProfileId: SESSION_PROFILE_ID,
                requireEmailVerification: true,
                loginId: 'email',
                emailVerificationExpiresSeconds: 900,
                emailVerificationMaxAttempts: 5,
                emailVerificationPurpose: 'email_verification',
            },
            email: { mode: 'log', from: 'no-reply@example.com', logIncludeSecrets: true },
        }

        let lastEmail = null
        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: ({ msg, ctx }) => {
                if (typeof msg === 'string' && msg.includes('Would send email verification')) {
                    lastEmail = ctx
                }
            },
        }

        // Minimal Security that maps tx -> Auth method and allows public permissions.
        const txMap = new Map([
            [10, { object_na: 'Auth', method_na: 'register' }],
            [11, { object_na: 'Auth', method_na: 'requestEmailVerification' }],
            [12, { object_na: 'Auth', method_na: 'verifyEmail' }],
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
                return ['register', 'requestEmailVerification', 'verifyEmail'].includes(method_na)
            },
            executeMethod: async ({ method_na, params }) => {
                return await auth[method_na](params)
            },
        }

        // DB stub for Auth + Session.
        const state = {
            nextUserId: 10,
            usersByEmail: new Map(),
            usersByUsername: new Map(),
            profilesByUserId: new Map(),
            otps: [],
        }

        globalThis.db = {
            exe: async (schema, query, params) => {
                if (schema !== 'security') return { rows: [] }

                if (query === 'insertAuditLog') return { rows: [] }
                if (query === 'updateUserLastLogin') return { rows: [] }

                if (query === 'getUserBaseByEmail') {
                    const [email] = params
                    const u = state.usersByEmail.get(email) ?? null
                    return { rows: u ? [u] : [] }
                }

                if (query === 'getUserBaseByUsername') {
                    const [username] = params
                    const u = state.usersByUsername.get(username) ?? null
                    return { rows: u ? [u] : [] }
                }

                if (query === 'insertUser') {
                    const [username, email, passwordHash] = params
                    const user_id = state.nextUserId++
                    const row = {
                        user_id,
                        user_na: username,
                        user_em: email,
                        email_verified_at: null,
                        user_pw: passwordHash,
                    }
                    state.usersByEmail.set(email, row)
                    state.usersByUsername.set(username, row)
                    return { rows: [{ user_id }] }
                }

                if (query === 'upsertUserProfile') {
                    const [userId, profileId] = params
                    state.profilesByUserId.set(userId, profileId)
                    return { rows: [] }
                }

                if (query === 'insertOneTimeCode') {
                    const [userId, purpose, codeHash, expiresSeconds, metaJson] = params
                    const meta = JSON.parse(metaJson)
                    const code_id = state.otps.length + 1
                    state.otps.push({
                        code_id,
                        user_id: userId,
                        purpose,
                        code_hash: codeHash,
                        expires_at: new Date(
                            Date.now() + Number(expiresSeconds) * 1000
                        ).toISOString(),
                        consumed_at: null,
                        attempt_count: 0,
                        meta,
                    })
                    return { rows: [{ code_id }] }
                }

                if (query === 'consumeOneTimeCodesForUserPurpose') {
                    const [userId, purpose] = params
                    for (const otp of state.otps) {
                        if (otp.user_id === userId && otp.purpose === purpose && !otp.consumed_at) {
                            otp.consumed_at = new Date().toISOString()
                        }
                    }
                    return { rows: [] }
                }

                if (query === 'getValidOneTimeCodeForPurposeAndTokenHash') {
                    const [purpose, tokenHash, codeHash] = params
                    const otp = [...state.otps]
                        .reverse()
                        .find(
                            (o) =>
                                o.purpose === purpose &&
                                o.meta?.tokenHash === tokenHash &&
                                o.code_hash === codeHash &&
                                !o.consumed_at &&
                                new Date(o.expires_at).getTime() > Date.now()
                        )
                    return { rows: otp ? [otp] : [] }
                }

                if (query === 'getActiveOneTimeCodeForPurposeAndTokenHash') {
                    const [purpose, tokenHash] = params
                    const otp = [...state.otps]
                        .reverse()
                        .find(
                            (o) =>
                                o.purpose === purpose &&
                                o.meta?.tokenHash === tokenHash &&
                                !o.consumed_at
                        )
                    return { rows: otp ? [otp] : [] }
                }

                if (query === 'incrementOneTimeCodeAttempt') {
                    const [codeId] = params
                    const otp = state.otps.find((o) => o.code_id === codeId)
                    if (otp) otp.attempt_count += 1
                    return { rows: [] }
                }

                if (query === 'consumeOneTimeCode') {
                    const [codeId] = params
                    const otp = state.otps.find((o) => o.code_id === codeId)
                    if (otp) otp.consumed_at = new Date().toISOString()
                    return { rows: [] }
                }

                if (query === 'setUserEmailVerified') {
                    const [userId] = params
                    for (const u of state.usersByEmail.values()) {
                        if (u.user_id === userId) u.email_verified_at = new Date().toISOString()
                    }
                    return { rows: [] }
                }

                if (query === 'getUserByEmail') {
                    const [email] = params
                    const u = state.usersByEmail.get(email)
                    if (!u) return { rows: [] }
                    const profile_id = state.profilesByUserId.get(u.user_id) ?? null
                    return {
                        rows: [
                            {
                                user_id: u.user_id,
                                user_na: u.user_na,
                                user_em: u.user_em,
                                email_verified_at: u.email_verified_at,
                                user_pw: u.user_pw,
                                profile_id,
                            },
                        ],
                    }
                }

                return { rows: [] }
            },
        }

        const csrfTokenHandler = createCsrfTokenHandler({
            config: globalThis.config,
            msgs: globalThis.msgs,
        })
        const csrfProtection = createCsrfProtection({
            config: globalThis.config,
            msgs: globalThis.msgs,
        })

        const dispatcher = new Dispatcher()

        dispatcher.app.get('/csrf', csrfTokenHandler)
        dispatcher.app.post('/toProccess', csrfProtection, dispatcher.toProccess.bind(dispatcher))
        dispatcher.app.post('/login', csrfProtection, dispatcher.login.bind(dispatcher))

        const agent = request.agent(dispatcher.app)

        // 1) Register
        const r1 = await agent.post('/toProccess').send({
            tx: 10,
            params: { email: 'u@example.com', username: 'user1', password: 'P@ssw0rd!!' },
        })
        assert.equal(r1.status, 201)

        assert.ok(lastEmail && typeof lastEmail.token === 'string' && lastEmail.token.length > 0)
        assert.ok(lastEmail && typeof lastEmail.code === 'string' && lastEmail.code.length > 0)

        // 2) Login should be blocked before verification
        const csrfRes = await agent.get('/csrf')
        const csrfToken = csrfRes.body.csrfToken
        assert.ok(typeof csrfToken === 'string' && csrfToken.length > 0)

        const loginBlocked = await agent
            .post('/login')
            .set('X-CSRF-Token', csrfToken)
            .send({ username: 'u@example.com', password: 'P@ssw0rd!!' })

        assert.equal(loginBlocked.status, 403)
        assert.equal(loginBlocked.body.code, 403)

        // 3) Verify email
        const r2 = await agent.post('/toProccess').send({
            tx: 12,
            params: { token: lastEmail.token, code: lastEmail.code },
        })
        assert.equal(r2.status, 200)
        assert.equal(r2.body.code, 200)

        const afterVerify = state.usersByEmail.get('u@example.com')
        assert.ok(afterVerify && afterVerify.email_verified_at, 'email_verified_at should be set')

        // 4) Login should now work
        const csrfRes2 = await agent.get('/csrf')
        const csrfToken2 = csrfRes2.body.csrfToken

        const loginOk = await agent
            .post('/login')
            .set('X-CSRF-Token', csrfToken2)
            .send({ username: 'u@example.com', password: 'P@ssw0rd!!' })

        assert.equal(
            loginOk.status,
            200,
            `Expected 200, got ${loginOk.status}: ${JSON.stringify(loginOk.body)}`
        )
        assert.equal(loginOk.body.code, 200)

        // Sanity: password hash was a bcrypt hash
        const created = state.usersByEmail.get('u@example.com')
        assert.ok(created && typeof created.user_pw === 'string')
        assert.ok(await bcrypt.compare('P@ssw0rd!!', created.user_pw))
    })
})
