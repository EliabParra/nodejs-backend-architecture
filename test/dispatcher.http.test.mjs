import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'

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
        payloadTooLarge: { code: 413, msg: 'Payload too large' },
    }

    const server = {
        serverError: { code: 500, msg: 'Server error' },
        unauthorized: { code: 401, msg: 'Unauthorized' },
        forbidden: { code: 403, msg: 'Forbidden' },
        notFound: { code: 404, msg: 'Not found' },
        txNotFound: { code: 500, msg: 'Tx not found: {tx}' },
    }

    const success = {
        login: { code: 200, msg: 'Login ok' },
        logout: { code: 200, msg: 'Logout ok' },
    }

    return {
        en: {
            alerts: {
                paramsType: 'Invalid type at {value}',
            },
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

test('POST /login returns invalidParameters when body schema is invalid (with CSRF)', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: { secret: 'test-secret', resave: false, saveUninitialized: true },
        }
        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.db = { exe: async () => {} }
        globalThis.security = { isReady: true }

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
        dispatcher.app.post('/login', csrfProtection, dispatcher.login.bind(dispatcher))

        const agent = request.agent(dispatcher.app)

        const csrfRes = await agent.get('/csrf')
        assert.equal(csrfRes.status, 200)
        const csrfToken = csrfRes.body.csrfToken
        assert.ok(typeof csrfToken === 'string' && csrfToken.length > 0)

        const res = await agent
            .post('/login')
            .set('X-CSRF-Token', csrfToken)
            .send({ username: 'u' })

        assert.equal(res.status, 400)
        assert.equal(res.body.code, 400)
        assert.equal(res.body.msg, globalThis.msgs.en.errors.client.invalidParameters.msg)
        assert.ok(Array.isArray(res.body.alerts) && res.body.alerts.length > 0)
    })
})

test('POST /toProccess returns login error when session does not exist', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: { secret: 'test-secret', resave: false, saveUninitialized: true },
        }
        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.db = { exe: async () => {} }
        globalThis.security = { isReady: true }

        const csrfProtection = createCsrfProtection({
            config: globalThis.config,
            msgs: globalThis.msgs,
        })

        const dispatcher = new Dispatcher()

        dispatcher.app.use(express.json())
        dispatcher.app.post('/toProccess', csrfProtection, dispatcher.toProccess.bind(dispatcher))

        const res = await request(dispatcher.app).post('/toProccess').send({ tx: 1 })
        assert.equal(res.status, 401)
        assert.deepEqual(res.body, globalThis.msgs.en.errors.client.login)
    })
})

test('POST /toProccess returns serviceUnavailable when security.ready rejects', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: { secret: 'test-secret', resave: false, saveUninitialized: true },
        }
        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.db = { exe: async () => {} }

        const ready = Promise.reject(new Error('not ready'))
        // Prevent unhandled rejection (Node test runner fails the test otherwise).
        ready.catch(() => {})

        globalThis.security = {
            isReady: false,
            ready,
            getDataTx: () => ({ method_na: 'm', object_na: 'o' }),
            getPermissions: () => true,
            executeMethod: async () => ({ code: 200, msg: 'ok' }),
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

        dispatcher.app.use(express.json())
        dispatcher.app.get('/csrf', csrfTokenHandler)
        dispatcher.app.get('/__setSession', (req, res) => {
            req.session.user_id = 1
            req.session.profile_id = 2
            res.status(200).send({ ok: true })
        })
        dispatcher.app.post('/toProccess', csrfProtection, dispatcher.toProccess.bind(dispatcher))

        const agent = request.agent(dispatcher.app)

        await agent.get('/__setSession')
        const csrfRes = await agent.get('/csrf')
        const csrfToken = csrfRes.body.csrfToken

        const res = await agent.post('/toProccess').set('X-CSRF-Token', csrfToken).send({ tx: 1 })

        assert.equal(res.status, 503)
        assert.deepEqual(res.body, globalThis.msgs.en.errors.client.serviceUnavailable)
    })
})

test('POST /toProccess returns permissionDenied when permissions check fails (and audits best-effort)', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: { secret: 'test-secret', resave: false, saveUninitialized: true },
        }

        const auditCalls = []
        globalThis.db = {
            exe: async (...args) => auditCalls.push(args),
        }

        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.security = {
            isReady: true,
            getDataTx: () => ({ method_na: 'm', object_na: 'o' }),
            getPermissions: () => false,
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

        dispatcher.app.use(express.json())
        dispatcher.app.get('/csrf', csrfTokenHandler)
        dispatcher.app.get('/__setSession', (req, res) => {
            req.session.user_id = 1
            req.session.profile_id = 2
            res.status(200).send({ ok: true })
        })
        dispatcher.app.post('/toProccess', csrfProtection, dispatcher.toProccess.bind(dispatcher))

        const agent = request.agent(dispatcher.app)

        await agent.get('/__setSession')
        const csrfRes = await agent.get('/csrf')
        const csrfToken = csrfRes.body.csrfToken

        const res = await agent
            .post('/toProccess')
            .set('X-CSRF-Token', csrfToken)
            .send({ tx: 1, params: { a: 1 } })

        assert.equal(res.status, 403)
        assert.deepEqual(res.body, globalThis.msgs.en.errors.client.permissionDenied)

        assert.ok(auditCalls.length >= 1)
        assert.equal(auditCalls[0][0], 'security')
        assert.equal(auditCalls[0][1], 'insertAuditLog')
    })
})

test('POST /toProccess returns executeMethod response when permissions allow (and audits tx_exec)', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: { secret: 'test-secret', resave: false, saveUninitialized: true },
        }

        const auditCalls = []
        globalThis.db = {
            exe: async (...args) => auditCalls.push(args),
        }

        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.security = {
            isReady: true,
            getDataTx: (tx) => (tx === 1 ? { method_na: 'doThing', object_na: 'Thing' } : null),
            getPermissions: () => true,
            executeMethod: async (data) => ({ code: 201, msg: 'created', data }),
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

        dispatcher.app.use(express.json())
        dispatcher.app.get('/csrf', csrfTokenHandler)
        dispatcher.app.get('/__setSession', (req, res) => {
            req.session.user_id = 10
            req.session.profile_id = 20
            res.status(200).send({ ok: true })
        })
        dispatcher.app.post('/toProccess', csrfProtection, dispatcher.toProccess.bind(dispatcher))

        const agent = request.agent(dispatcher.app)

        await agent.get('/__setSession')
        const csrfRes = await agent.get('/csrf')
        const csrfToken = csrfRes.body.csrfToken

        const res = await agent
            .post('/toProccess')
            .set('X-CSRF-Token', csrfToken)
            .send({ tx: 1, params: { a: 1 } })

        assert.equal(res.status, 201)
        assert.equal(res.body.code, 201)
        assert.equal(res.body.msg, 'created')
        assert.equal(res.body.data.profile_id, 20)
        assert.equal(res.body.data.object_na, 'Thing')
        assert.equal(res.body.data.method_na, 'doThing')

        const auditInsertCalls = auditCalls.filter(
            (c) => c[0] === 'security' && c[1] === 'insertAuditLog'
        )
        assert.ok(auditInsertCalls.length >= 1)
        const hasTxExec = auditInsertCalls.some((c) => Array.isArray(c[2]) && c[2][3] === 'tx_exec')
        assert.equal(hasTxExec, true)
    })
})

test('POST /toProccess returns unknown when tx is not found (and audits tx_error)', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: { secret: 'test-secret', resave: false, saveUninitialized: true },
        }

        const auditCalls = []
        globalThis.db = {
            exe: async (...args) => auditCalls.push(args),
        }

        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.security = {
            isReady: true,
            getDataTx: () => null,
            getPermissions: () => true,
            executeMethod: async () => ({ code: 200, msg: 'ok' }),
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

        dispatcher.app.use(express.json())
        dispatcher.app.get('/csrf', csrfTokenHandler)
        dispatcher.app.get('/__setSession', (req, res) => {
            req.session.user_id = 10
            req.session.profile_id = 20
            res.status(200).send({ ok: true })
        })
        dispatcher.app.post('/toProccess', csrfProtection, dispatcher.toProccess.bind(dispatcher))

        const agent = request.agent(dispatcher.app)

        await agent.get('/__setSession')
        const csrfRes = await agent.get('/csrf')
        const csrfToken = csrfRes.body.csrfToken

        const res = await agent
            .post('/toProccess')
            .set('X-CSRF-Token', csrfToken)
            .send({ tx: 1, params: { a: 1 } })

        assert.equal(res.status, 500)
        assert.deepEqual(res.body, globalThis.msgs.en.errors.client.unknown)

        const auditInsertCalls = auditCalls.filter(
            (c) => c[0] === 'security' && c[1] === 'insertAuditLog'
        )
        assert.ok(auditInsertCalls.length >= 1)
        const hasTxError = auditInsertCalls.some(
            (c) => Array.isArray(c[2]) && c[2][3] === 'tx_error'
        )
        assert.equal(hasTxError, true)
    })
})

test('POST /logout returns login error when session does not exist (CSRF bypass)', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: { secret: 'test-secret', resave: false, saveUninitialized: true },
        }
        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.db = { exe: async () => {} }
        globalThis.security = { isReady: true }

        const csrfProtection = createCsrfProtection({
            config: globalThis.config,
            msgs: globalThis.msgs,
        })

        const dispatcher = new Dispatcher()
        dispatcher.app.use(express.json())
        dispatcher.app.post('/logout', csrfProtection, dispatcher.logout.bind(dispatcher))

        const res = await request(dispatcher.app).post('/logout').send({})
        assert.equal(res.status, 401)
        assert.deepEqual(res.body, globalThis.msgs.en.errors.client.login)
    })
})

test('POST /logout destroys session and returns success when session exists (requires CSRF)', async () => {
    await withGlobals(GLOBAL_KEYS, async () => {
        globalThis.msgs = makeTestMsgs()
        globalThis.v = makeValidatorStub()
        globalThis.config = {
            app: { lang: 'en', bodyLimit: '100kb' },
            cors: { enabled: false },
            session: { secret: 'test-secret', resave: false, saveUninitialized: true },
        }

        const auditCalls = []
        globalThis.db = {
            exe: async (...args) => auditCalls.push(args),
        }

        globalThis.log = {
            TYPE_INFO: 'info',
            TYPE_WARNING: 'warn',
            TYPE_ERROR: 'error',
            show: () => {},
        }
        globalThis.security = { isReady: true }

        const csrfTokenHandler = createCsrfTokenHandler({
            config: globalThis.config,
            msgs: globalThis.msgs,
        })
        const csrfProtection = createCsrfProtection({
            config: globalThis.config,
            msgs: globalThis.msgs,
        })

        const dispatcher = new Dispatcher()
        dispatcher.app.use(express.json())

        dispatcher.app.get('/csrf', csrfTokenHandler)
        dispatcher.app.get('/__setSession', (req, res) => {
            req.session.user_id = 10
            req.session.profile_id = 20
            res.status(200).send({ ok: true })
        })
        dispatcher.app.post('/logout', csrfProtection, dispatcher.logout.bind(dispatcher))

        const agent = request.agent(dispatcher.app)
        await agent.get('/__setSession')

        const csrfRes = await agent.get('/csrf')
        const csrfToken = csrfRes.body.csrfToken

        const res = await agent.post('/logout').set('X-CSRF-Token', csrfToken).send({})

        assert.equal(res.status, 200)
        assert.deepEqual(res.body, globalThis.msgs.en.success.logout)

        const auditInsertCalls = auditCalls.filter(
            (c) => c[0] === 'security' && c[1] === 'insertAuditLog'
        )
        assert.ok(auditInsertCalls.length >= 1)
        const hasLogout = auditInsertCalls.some((c) => Array.isArray(c[2]) && c[2][3] === 'logout')
        assert.equal(hasLogout, true)

        // After logout, session should be gone (new request should behave as unauthenticated).
        const res2 = await agent.post('/logout').send({})
        assert.equal(res2.status, 401)
    })
})
