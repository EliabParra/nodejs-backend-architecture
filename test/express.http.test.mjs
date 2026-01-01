import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'

import { applyRequestId } from '../src/express/middleware/request-id.js'
import { applyRequestLogger } from '../src/express/middleware/request-logger.js'
import { applyCorsIfEnabled } from '../src/express/middleware/cors.js'
import { applyBodyParsers } from '../src/express/middleware/body-parsers.js'
import { jsonBodySyntaxErrorHandler } from '../src/express/middleware/json-syntax-error.js'
import { createFinalErrorHandler } from '../src/express/middleware/final-error-handler.js'
import { csrfProtection, csrfTokenHandler } from '../src/express/middleware/csrf.js'
import { createLoginRateLimiter } from '../src/express/rate-limit/limiters.js'
import { applySessionMiddleware } from '../src/express/session/apply-session-middleware.js'
import { createHealthHandler } from '../src/express/handlers/health.js'
import { createReadyHandler } from '../src/express/handlers/ready.js'

import { withGlobals, withGlobalLock, snapshotGlobals, restoreGlobals } from './_helpers/global-state.mjs'

const GLOBAL_KEYS = ['config', 'msgs', 'log', 'db', 'security']

function makeErrors() {
  return {
    clientErrors: {
      unknown: { code: 500, msg: 'Unknown' },
      invalidParameters: { code: 400, msg: 'Invalid parameters' },
      payloadTooLarge: { code: 413, msg: 'Payload too large' },
      tooManyRequests: { code: 429, msg: 'Too many requests' },
      serviceUnavailable: { code: 503, msg: 'Service unavailable' }
    },
    serverErrors: {
      serverError: { code: 500, msg: 'Server error' },
      unauthorized: { code: 401, msg: 'Unauthorized' },
      forbidden: { code: 403, msg: 'Forbidden' },
      notFound: { code: 404, msg: 'Not found' }
    }
  }
}

function makeEsMsgsForCsrfAndJson() {
  return {
    es: {
      alerts: {
        invalidJson: 'JSON inválido en {value}',
        paramsType: 'Tipo inválido en {value}'
      },
      errors: {
        client: {
          unknown: { msg: 'Error desconocido', code: 500 },
          invalidParameters: { msg: 'Parámetros inválidos', code: 400 },
          csrfInvalid: { msg: 'CSRF inválido', code: 403 },
          payloadTooLarge: { msg: 'Payload demasiado grande', code: 413 },
          tooManyRequests: { msg: 'Demasiadas solicitudes', code: 429 }
        },
        server: {
          serverError: { msg: 'Error del servidor', code: 500 },
          unauthorized: { msg: 'No autorizado', code: 401 },
          forbidden: { msg: 'Prohibido', code: 403 },
          notFound: { msg: 'No encontrado', code: 404 }
        }
      },
      success: {}
    }
  }
}

test('GET /health returns ok + name + requestId (and X-Request-Id header)', async () => {
  await withGlobals(GLOBAL_KEYS, async () => {
      const app = express()
      applyRequestId(app)
      app.get('/health', createHealthHandler({ name: 'test-service' }))

      const res = await request(app).get('/health')

      assert.equal(res.status, 200)
      assert.equal(res.body.ok, true)
      assert.equal(res.body.name, 'test-service')
      assert.ok(typeof res.body.requestId === 'string' && res.body.requestId.length > 0)
      assert.equal(res.headers['x-request-id'], res.body.requestId)
  })
})

test('GET /ready returns 503 when security is not ready', async () => {
  await withGlobals(GLOBAL_KEYS, async () => {
      const { clientErrors } = makeErrors()

      globalThis.security = { isReady: false }
      globalThis.db = { pool: { query: async () => ({ rows: [{ '?column?': 1 }] }) } }

      const app = express()
      app.get('/ready', createReadyHandler({ clientErrors }))

      const res = await request(app).get('/ready')
      assert.equal(res.status, 503)
      assert.deepEqual(res.body, clientErrors.serviceUnavailable)
  })
})

test('GET /ready returns 503 when DB is not reachable (db check fails)', async () => {
  await withGlobals(GLOBAL_KEYS, async () => {
      const { clientErrors } = makeErrors()

      globalThis.security = { isReady: true }
      globalThis.db = { pool: { query: async () => { throw new Error('db down') } } }

      const app = express()
      app.get('/ready', createReadyHandler({ clientErrors }))

      const res = await request(app).get('/ready')
      assert.equal(res.status, 503)
      assert.deepEqual(res.body, clientErrors.serviceUnavailable)
  })
})

test('GET /ready returns 200 when security is ready and DB check succeeds', async () => {
  await withGlobals(GLOBAL_KEYS, async () => {
      const { clientErrors } = makeErrors()

      globalThis.security = { isReady: true }
      globalThis.db = { pool: { query: async () => ({ rows: [{ '?column?': 1 }] }) } }

      const app = express()
      app.get('/ready', createReadyHandler({ clientErrors }))

      const res = await request(app).get('/ready')
      assert.equal(res.status, 200)
      assert.deepEqual(res.body, { ok: true })
  })
})

test('final error handler maps status=400 to invalidParameters', async () => {
  await withGlobals(GLOBAL_KEYS, async () => {
      const { clientErrors, serverErrors } = makeErrors()

      const events = []
      globalThis.log = {
        TYPE_ERROR: 'error',
        show: (e) => events.push(e)
      }

      const app = express()
      app.use((req, res, next) => {
        req.requestId = 'rid-1'
        req.requestStartMs = Date.now()
        next()
      })

      app.get('/boom', () => {
        const err = new Error('bad request')
        err.status = 400
        throw err
      })

      app.use(createFinalErrorHandler({ clientErrors, serverErrors }))

      const res = await request(app).get('/boom')
      assert.equal(res.status, 400)
      assert.deepEqual(res.body, { msg: clientErrors.invalidParameters.msg, code: 400, alerts: [] })
      assert.ok(events.length >= 1)
  })
})

test('CORS origin not allowed is mapped to 403 by final error handler', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      const { clientErrors, serverErrors } = makeErrors()

      globalThis.log = { TYPE_ERROR: 'error', show: () => {} }
      globalThis.config = {
        cors: { enabled: true, credentials: true, origins: ['http://allowed.local'] },
        app: { lang: 'en' }
      }

      const app = express()
      applyCorsIfEnabled(app)
      app.get('/ok', (req, res) => res.status(200).send({ ok: true }))
      app.use(createFinalErrorHandler({ clientErrors, serverErrors }))

      const res = await request(app).get('/ok').set('Origin', 'http://blocked.local')
      assert.equal(res.status, 403)
      assert.equal(res.body.code, 403)
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('request logger logs info for 2xx and warning for 4xx/5xx unless already logged', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      const events = []
      globalThis.log = {
        TYPE_INFO: 'info',
        TYPE_WARNING: 'warn',
        show: (e) => events.push(e)
      }

      const app = express()
      app.use((req, res, next) => {
        req.requestId = 'rid-2'
        req.requestStartMs = Date.now()
        next()
      })
      applyRequestLogger(app)

      app.get('/ok', (req, res) => res.status(200).send({ ok: true }))
      app.get('/err', (req, res) => res.status(500).send({ ok: false }))
      app.get('/err-logged', (req, res) => {
        res.locals.__errorLogged = true
        return res.status(500).send({ ok: false })
      })

      events.length = 0
      await request(app).get('/ok')
      assert.equal(events.length, 1)
      assert.equal(events[0].type, 'info')

      events.length = 0
      await request(app).get('/err')
      assert.equal(events.length, 1)
      assert.equal(events[0].type, 'warn')

      events.length = 0
      await request(app).get('/err-logged')
      assert.equal(events.length, 0)
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('jsonBodySyntaxErrorHandler returns invalidParameters with alerts on invalid JSON', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.config = { app: { lang: 'es' } }
      globalThis.msgs = {
        es: {
          alerts: { invalidJson: 'JSON inválido en {value}' },
          errors: { client: { invalidParameters: { msg: 'Parámetros inválidos', code: 400 } } }
        }
      }

      const app = express()
      app.use(express.json())
      app.post('/t', (req, res) => res.status(200).send({ ok: true }))
      app.use(jsonBodySyntaxErrorHandler)

      const res = await request(app)
        .post('/t')
        .set('Content-Type', 'application/json')
        .send('{"a":')

      assert.equal(res.status, 400)
      assert.equal(res.body.code, 400)
      assert.equal(res.body.msg, 'Parámetros inválidos')
      assert.deepEqual(res.body.alerts, ['JSON inválido en body'])
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('csrfTokenHandler returns unknown when session is missing', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.config = { app: { lang: 'es' } }
      globalThis.msgs = makeEsMsgsForCsrfAndJson()

      const app = express()
      app.get('/csrf', csrfTokenHandler)

      const res = await request(app).get('/csrf')
      assert.equal(res.status, 500)
      assert.equal(res.body.code, 500)
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('csrfTokenHandler returns a csrfToken when session exists', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.config = { app: { lang: 'es' } }
      globalThis.msgs = makeEsMsgsForCsrfAndJson()

      const app = express()
      app.use((req, res, next) => {
        req.session = {}
        next()
      })
      app.get('/csrf', csrfTokenHandler)

      const res = await request(app).get('/csrf')
      assert.equal(res.status, 200)
      assert.ok(typeof res.body.csrfToken === 'string')
      assert.ok(/^[0-9a-f]{64}$/i.test(res.body.csrfToken))
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('csrfProtection bypasses /toProccess when unauthenticated', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.config = { app: { lang: 'es' } }
      globalThis.msgs = makeEsMsgsForCsrfAndJson()

      const app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.session = {}
        next()
      })
      app.post('/toProccess', csrfProtection, (req, res) => res.status(200).send({ ok: true }))

      const res = await request(app).post('/toProccess').send({ tx: 1 })
      assert.equal(res.status, 200)
      assert.deepEqual(res.body, { ok: true })
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('csrfProtection rejects when expected token is missing', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.config = { app: { lang: 'es' } }
      globalThis.msgs = makeEsMsgsForCsrfAndJson()

      const app = express()
      app.use((req, res, next) => {
        req.session = {}
        next()
      })
      app.post('/login', csrfProtection, (req, res) => res.status(200).send({ ok: true }))

      const res = await request(app).post('/login').set('X-CSRF-Token', 'abc').send({})
      assert.equal(res.status, 403)
      assert.deepEqual(res.body, globalThis.msgs.es.errors.client.csrfInvalid)
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('csrfProtection allows request when header matches session token', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.config = { app: { lang: 'es' } }
      globalThis.msgs = makeEsMsgsForCsrfAndJson()

      const app = express()
      app.use((req, res, next) => {
        req.session = { csrfToken: 'token-1', user_id: 1 }
        next()
      })
      app.post('/login', csrfProtection, (req, res) => res.status(200).send({ ok: true }))

      const res = await request(app).post('/login').set('X-CSRF-Token', 'token-1').send({})
      assert.equal(res.status, 200)
      assert.deepEqual(res.body, { ok: true })
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('applyBodyParsers + final error handler maps oversized JSON body to payloadTooLarge (413)', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      const { clientErrors, serverErrors } = makeErrors()
      globalThis.config = { app: { lang: 'en', bodyLimit: '1kb' } }
      globalThis.log = { TYPE_ERROR: 'error', show: () => {} }

      const app = express()
      applyBodyParsers(app)
      app.post('/t', (req, res) => res.status(200).send({ ok: true }))
      app.use(createFinalErrorHandler({ clientErrors, serverErrors }))

      const big = 'a'.repeat(2000)
      const res = await request(app)
        .post('/t')
        .set('Content-Type', 'application/json')
        .send({ big })

      assert.equal(res.status, 413)
      assert.equal(res.body.code, 413)
      assert.equal(res.body.msg, clientErrors.payloadTooLarge.msg)
      assert.deepEqual(res.body.alerts, [])
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('login rate limiter returns tooManyRequests after 10 requests/minute', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      const { clientErrors } = makeErrors()

      const app = express()
      app.get('/login', createLoginRateLimiter(clientErrors), (req, res) => res.status(200).send({ ok: true }))

      for (let i = 0; i < 10; i++) {
        const res = await request(app).get('/login')
        assert.equal(res.status, 200)
      }

      const limited = await request(app).get('/login')
      assert.equal(limited.status, 429)
      assert.deepEqual(limited.body, clientErrors.tooManyRequests)
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('applySessionMiddleware maps cookie.sameSite boolean=true to Lax', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.log = { TYPE_WARNING: 'warn', show: () => {} }
      globalThis.config = {
        app: { lang: 'en' },
        session: {
          secret: 'test-secret',
          resave: false,
          saveUninitialized: true,
          cookie: { sameSite: true }
        }
      }

      const app = express()
      applySessionMiddleware(app)
      app.get('/set', (req, res) => {
        req.session.t = 1
        res.status(200).send({ ok: true })
      })

      const res = await request(app).get('/set')
      const setCookie = res.headers['set-cookie']?.[0]
      assert.ok(typeof setCookie === 'string' && setCookie.length > 0)
      assert.ok(setCookie.includes('SameSite=Lax'))
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('applySessionMiddleware maps cookie.sameSite boolean=false to Strict', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.log = { TYPE_WARNING: 'warn', show: () => {} }
      globalThis.config = {
        app: { lang: 'en' },
        session: {
          secret: 'test-secret',
          resave: false,
          saveUninitialized: true,
          cookie: { sameSite: false }
        }
      }

      const app = express()
      applySessionMiddleware(app)
      app.get('/set', (req, res) => {
        req.session.t = 1
        res.status(200).send({ ok: true })
      })

      const res = await request(app).get('/set')
      const setCookie = res.headers['set-cookie']?.[0]
      assert.ok(typeof setCookie === 'string' && setCookie.length > 0)
      assert.ok(setCookie.includes('SameSite=Strict'))
    } finally {
      restoreGlobals(snap)
    }
  })
})

test('applySessionMiddleware sets trust proxy when cookie.secure=true (and allows secure cookie behind proxy)', async () => {
  await withGlobalLock(async () => {
    const snap = snapshotGlobals(GLOBAL_KEYS)
    try {
      globalThis.log = { TYPE_WARNING: 'warn', show: () => {} }
      globalThis.config = {
        app: { lang: 'en' },
        session: {
          secret: 'test-secret',
          resave: false,
          saveUninitialized: true,
          cookie: { sameSite: true, secure: true }
        }
      }

      const app = express()
      // Express default is `false`. The middleware only sets trust proxy when it is null/undefined.
      app.set('trust proxy', null)

      applySessionMiddleware(app)
      app.get('/set', (req, res) => {
        req.session.t = 1
        res.status(200).send({ ok: true })
      })

      assert.equal(app.get('trust proxy'), 1)

      const res = await request(app)
        .get('/set')
        .set('X-Forwarded-Proto', 'https')

      const setCookie = res.headers['set-cookie']?.[0]
      assert.ok(typeof setCookie === 'string' && setCookie.length > 0)
      assert.ok(setCookie.includes('Secure'))
      assert.ok(setCookie.includes('SameSite=Lax'))
    } finally {
      restoreGlobals(snap)
    }
  })
})
