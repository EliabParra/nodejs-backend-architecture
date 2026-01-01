import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { registerFrontendHosting } from '../src/frontend-adapters/index.js'
import { routes } from '../src/router/routes.js'
import { withGlobals } from './_helpers/global-state.mjs'

function makeMsgs() {
  return {
    en: {
      errors: {
        client: {
          unknown: { code: 500, msg: 'Unknown' }
        }
      }
    }
  }
}

test('buildPagesRouter redirects when validateIsAuth=true and session missing', async () => {
  await withGlobals(['config', 'msgs', 'log'], async () => {
    globalThis.config = { app: { lang: 'en' } }
    globalThis.msgs = makeMsgs()
    globalThis.log = { TYPE_ERROR: 'error', show: () => {} }

    const { buildPagesRouter } = await import('../src/router/pages.js')

    const added = { name: 'private', path: '/private', view: 'index', validateIsAuth: true }
    routes.push(added)

    try {
      const app = express()
      const session = { sessionExists: () => false }
      app.use(buildPagesRouter({ session }))

      const res = await request(app).get('/private')
      assert.equal(res.status, 302)
      assert.ok(String(res.headers.location).startsWith('/?returnTo='))
    } finally {
      routes.pop()
    }
  })
})

test('buildPagesRouter serves page when authenticated', async () => {
  await withGlobals(['config', 'msgs', 'log'], async () => {
    globalThis.config = { app: { lang: 'en' } }
    globalThis.msgs = makeMsgs()
    globalThis.log = { TYPE_ERROR: 'error', show: () => {} }

    const { buildPagesRouter } = await import('../src/router/pages.js')

    const added = { name: 'private', path: '/private', view: 'index', validateIsAuth: true }
    routes.push(added)

    try {
      const app = express()
      const session = { sessionExists: () => true }
      app.use(buildPagesRouter({ session }))

      const res = await request(app).get('/private')
      assert.equal(res.status, 200)
      assert.ok(String(res.headers['content-type']).includes('text/html'))
      assert.ok(String(res.text).toLowerCase().includes('<html'))
    } finally {
      routes.pop()
    }
  })
})

test('registerFrontendHosting does nothing when stage does not match', async () => {
  await withGlobals(['config'], async () => {
    globalThis.config = { app: { frontendMode: 'invalid' } }

    const app = express()
    await registerFrontendHosting(app, { stage: 'postApi', session: {} })

    // No throw = OK. This covers mode fallback + stage mismatch.
    assert.equal(typeof app, 'function')
  })
})

test('registerPagesHosting mounts static + pages router', async () => {
  await withGlobals(['config', 'msgs', 'log'], async () => {
    globalThis.config = { app: { lang: 'en' } }
    globalThis.msgs = makeMsgs()
    globalThis.log = { TYPE_ERROR: 'error', show: () => {} }

    const { registerPagesHosting } = await import('../src/frontend-adapters/pages.adapter.js')

    const app = express()
    const session = { sessionExists: () => true }
    await registerPagesHosting(app, { session })

    const res = await request(app).get('/').set('Accept', 'text/html')
    assert.equal(res.status, 200)
    assert.ok(String(res.text).toLowerCase().includes('<html'))
  })
})

test('registerFrontendHosting spa mode serves index.html fallback for html requests', async () => {
  const prev = process.env.SPA_DIST_PATH
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spa-dist-'))

  try {
    await fs.writeFile(path.join(tmpDir, 'index.html'), '<html><body>SPA OK</body></html>', 'utf8')
    process.env.SPA_DIST_PATH = tmpDir

    await withGlobals(['config'], async () => {
      globalThis.config = { app: { frontendMode: 'spa' } }

      const app = express()
      await registerFrontendHosting(app, { stage: 'postApi', session: {} })

      const res = await request(app).get('/anything').set('Accept', 'text/html')
      assert.equal(res.status, 200)
      assert.ok(String(res.text).includes('SPA OK'))

      const res2 = await request(app).get('/anything').set('Accept', 'application/json')
      assert.equal(res2.status, 404)
    })
  } finally {
    if (prev == null) delete process.env.SPA_DIST_PATH
    else process.env.SPA_DIST_PATH = prev
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})

test('registerFrontendHosting spa mode throws when SPA_DIST_PATH is missing (non-interactive)', async () => {
  const prev = process.env.SPA_DIST_PATH
  try {
    delete process.env.SPA_DIST_PATH

    await withGlobals(['config'], async () => {
      globalThis.config = { app: { frontendMode: 'spa' } }
      const app = express()

      await assert.rejects(
        async () => {
          await registerFrontendHosting(app, { stage: 'postApi', session: {} })
        },
        /SPA_DIST_PATH/i
      )
    })
  } finally {
    if (prev != null) process.env.SPA_DIST_PATH = prev
  }
})
