import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import request from 'supertest'

import Dispatcher from '../src/BSS/Dispatcher.js'
import { createCsrfProtection, createCsrfTokenHandler } from '../src/express/middleware/csrf.js'

import { withGlobals } from './_helpers/global-state.mjs'

const GLOBAL_KEYS = ['config', 'msgs', 'log', 'db', 'security', 'v']

function sha256Hex(value) {
    return createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function makeTestMsgs() {
    const client = {
        unknown: { code: 500, msg: 'Unknown' },
        invalidParameters: { code: 400, msg: 'Invalid parameters' },
        login: { code: 401, msg: 'Login required' },
        sessionExists: { code: 409, msg: 'Session exists' },
        usernameOrPasswordIncorrect: { code: 401, msg: 'Bad credentials' },
        invalidToken: { code: 401, msg: 'Invalid token' },
        expiredToken: { code: 401, msg: 'Expired token' },
        tooManyRequests: { code: 429, msg: 'Too many requests' },
        csrfInvalid: { code: 403, msg: 'CSRF invalid' },
        emailRequired: { code: 409, msg: 'Email required' },
    }

    const server = {
        serverError: { code: 500, msg: 'Server error' },
        dbError: { code: 500, msg: 'DB error' },
    }

    const success = {
        login: { code: 200, msg: 'Login ok' },
        loginVerificationRequired: { code: 202, msg: 'Verify required' },
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
    }
}

test('2-step login is required on new device and can be verified', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', name: 'app', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: {
                secret: 'test-secret',
                resave: false,
                saveUninitialized: true,
                cookie: { secure: false, sameSite: 'lax' },
            },
            auth: {
                loginId: 'username',
                login2StepNewDevice: true,
                publicProfileId: 2,
                deviceCookieName: 'device_token',
                deviceCookieMaxAgeMs: 1000 * 60 * 60 * 24,
                loginChallengeExpiresSeconds: 600,
                loginChallengeMaxAttempts: 5,
            },
            email: { mode: 'log', from: 'no-reply@example.com' },
        }
        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.security = {
            isReady: true,
            getDataTx: (tx) => {
                if (tx === 999) return { object_na: 'Auth', method_na: 'verifyLoginChallenge' }
                return false
            },
            getPermissions: () => true,
        }

        const userRow = {
            user_id: 10,
            user_na: 'u',
            user_em: 'u@example.com',
            user_pw: await (await import('bcryptjs')).default.hash('p@ssw0rd!!', 10),
            profile_id: 2,
        }

        const issuedToken = 'tok_test'
        const issuedCode = '123456'

        const dbCalls = []
        globalThis.db = {
            exe: async (schema, query, params) => {
                dbCalls.push([schema, query, params])
                if (schema !== 'security') return { rows: [] }

                if (query === 'getUserByUsername') return { rows: [userRow] }

                if (query === 'getActiveUserDeviceByUserAndTokenHash') return { rows: [] }

                if (query === 'insertLoginChallenge') {
                    // Ensure we store what we expect (token/code are hashed)
                    assert.equal(params[0], userRow.user_id)
                    assert.equal(params[1], sha256Hex(issuedToken))
                    assert.equal(params[2], sha256Hex(issuedCode))
                    return { rows: [{ challenge_id: 1 }] }
                }

                if (query === 'getLoginChallengeByTokenHash') {
                    assert.equal(params[0], sha256Hex(issuedToken))
                    return {
                        rows: [
                            {
                                challenge_id: 1,
                                user_id: userRow.user_id,
                                code_hash: sha256Hex(issuedCode),
                                expires_at: new Date(Date.now() + 60_000).toISOString(),
                                verified_at: null,
                                attempt_count: 0,
                                user_na: userRow.user_na,
                                user_em: userRow.user_em,
                                profile_id: userRow.profile_id,
                            },
                        ],
                    }
                }

                if (query === 'markLoginChallengeVerified') return { rows: [] }
                if (query === 'upsertUserDevice') return { rows: [{ device_id: 1 }] }
                if (query === 'updateUserLastLogin') return { rows: [] }
                if (query === 'incrementLoginChallengeAttempt') return { rows: [] }
                if (query === 'touchUserDevice') return { rows: [] }

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

        // Custom routes for test (avoid calling init())
        dispatcher.app.get('/csrf', csrfTokenHandler)
        dispatcher.app.post('/login', csrfProtection, dispatcher.login.bind(dispatcher))
        dispatcher.app.post('/toProccess', csrfProtection, dispatcher.toProccess.bind(dispatcher))

        const agent = request.agent(dispatcher.app)

        const csrfRes = await agent.get('/csrf')
        const csrfToken = csrfRes.body.csrfToken

        // Patch random token/code in Session by monkeypatching crypto/random usage behavior via deterministic inputs.
        // Here we rely on the fact that Session will return challengeToken; we then verify using a DB stub
        // that expects the specific issuedToken/issuedCode.

        // 1) Start login -> should require verification on new device
        // We can't force Session's random values directly without a heavy mock, so instead we accept whatever
        // challengeToken it returns and then drive DB expectations from that.

        // Rewire DB stub expectations to accept the runtime token/code produced.
        let runtimeToken = null
        let runtimeCodeHash = null
        globalThis.db.exe = async (schema, query, params) => {
            dbCalls.push([schema, query, params])
            if (schema !== 'security') return { rows: [] }

            if (query === 'getUserByUsername') return { rows: [userRow] }
            if (query === 'getActiveUserDeviceByUserAndTokenHash') return { rows: [] }

            if (query === 'insertLoginChallenge') {
                runtimeToken = params[1]
                runtimeCodeHash = params[2]
                return { rows: [{ challenge_id: 1 }] }
            }

            if (query === 'getLoginChallengeByTokenHash') {
                assert.equal(params[0], runtimeToken)
                return {
                    rows: [
                        {
                            challenge_id: 1,
                            user_id: userRow.user_id,
                            code_hash: runtimeCodeHash,
                            expires_at: new Date(Date.now() + 60_000).toISOString(),
                            verified_at: null,
                            attempt_count: 0,
                            user_na: userRow.user_na,
                            user_em: userRow.user_em,
                            profile_id: userRow.profile_id,
                        },
                    ],
                }
            }

            if (query === 'markLoginChallengeVerified') return { rows: [] }
            if (query === 'upsertUserDevice') return { rows: [{ device_id: 1 }] }
            if (query === 'updateUserLastLogin') return { rows: [] }
            if (query === 'incrementLoginChallengeAttempt') return { rows: [] }
            if (query === 'touchUserDevice') return { rows: [] }
            return { rows: [] }
        }

        const startRes = await agent
            .post('/login')
            .set('X-CSRF-Token', csrfToken)
            .send({ username: 'u', password: 'p@ssw0rd!!' })

        assert.equal(startRes.status, 202)
        assert.equal(startRes.body.code, 202)
        assert.ok(
            typeof startRes.body.challengeToken === 'string' &&
                startRes.body.challengeToken.length > 0
        )

        // 2) Verify with the provided token, but code must match the stored hash.
        // Since the code is emailed, we can't know it here; instead, we accept the hash and use a code
        // that matches it by setting runtimeCodeHash to match sha256Hex(code) for a chosen code.
        const chosenCode = '123456'
        runtimeCodeHash = sha256Hex(chosenCode)

        const verifyRes = await agent.post('/toProccess').send({
            tx: 999,
            params: { token: startRes.body.challengeToken, code: chosenCode },
        })

        assert.equal(verifyRes.status, 200)
        assert.equal(verifyRes.body.code, 200)
        // Should set trusted device cookie
        const setCookie = verifyRes.headers['set-cookie']
        assert.ok(Array.isArray(setCookie) && setCookie.some((c) => c.includes('device_token=')))
    })
})
