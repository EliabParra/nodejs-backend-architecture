import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Security from '../src/BSS/Security.js'
import { withGlobals } from './_helpers/global-state.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function makeMsgs() {
    return {
        en: {
            errors: {
                server: {
                    serverError: { code: 500, msg: 'Server error' },
                },
            },
        },
    }
}

test('Security.init loads permissions + tx map and sets isReady', async () => {
    await withGlobals(['config', 'msgs', 'log', 'db'], async () => {
        globalThis.config = {
            app: { lang: 'en' },
            bo: { path: '../../BO/' },
        }
        globalThis.msgs = makeMsgs()

        const logs = []
        globalThis.log = { TYPE_ERROR: 'error', show: (e) => logs.push(e) }

        globalThis.db = {
            exe: async (schema, queryName) => {
                assert.equal(schema, 'security')
                if (queryName === 'loadPermissions') {
                    return { rows: [{ profile_id: 1, method_na: 'm', object_na: 'o' }] }
                }
                if (queryName === 'loadDataTx') {
                    return { rows: [{ tx_nu: 100, object_na: 'Order', method_na: 'createOrder' }] }
                }
                throw new Error(`Unexpected query: ${queryName}`)
            },
        }

        const security = new Security()
        await security.ready

        assert.equal(security.isReady, true)
        assert.equal(security.initError, null)

        assert.equal(
            security.getPermissions({ profile_id: 1, method_na: 'm', object_na: 'o' }),
            true
        )
        assert.equal(
            security.getPermissions({ profile_id: 2, method_na: 'm', object_na: 'o' }),
            false
        )

        assert.deepEqual(security.getDataTx(100), { object_na: 'Order', method_na: 'createOrder' })
        assert.equal(security.getDataTx(999), false)

        assert.equal(logs.length, 0)
    })
})

test('Security.init captures initError and rejects ready when DB fails', async () => {
    await withGlobals(['config', 'msgs', 'log', 'db'], async () => {
        globalThis.config = { app: { lang: 'en' }, bo: { path: '../../BO/' } }
        globalThis.msgs = makeMsgs()

        const logs = []
        globalThis.log = { TYPE_ERROR: 'error', show: (e) => logs.push(e) }

        globalThis.db = {
            exe: async (schema, queryName) => {
                if (schema !== 'security') throw new Error('wrong schema')
                if (queryName === 'loadPermissions') throw new Error('db down')
                if (queryName === 'loadDataTx') return { rows: [] }
                throw new Error(`Unexpected query: ${queryName}`)
            },
        }

        const security = new Security()

        let err
        try {
            await security.ready
        } catch (e) {
            err = e
        }

        assert.ok(err)
        assert.equal(security.isReady, false)
        assert.ok(security.initError)
        assert.ok(logs.some((l) => String(l?.msg ?? '').includes('Security.init')))
    })
})

test('Security.executeMethod dynamically imports BO and caches the instance', async () => {
    const objectName = `ZzSec${Date.now()}`
    const baseDir = path.join(repoRoot, 'BO', objectName)
    const boFile = path.join(baseDir, `${objectName}BO.ts`)

    await fs.mkdir(baseDir, { recursive: true })

    try {
        await fs.writeFile(
            boFile,
            [
                `globalThis.__securityBoCtorCount ??= 0;`,
                `export class ${objectName}BO {`,
                `  constructor() { globalThis.__securityBoCtorCount++; }`,
                `  async ping(params) { return { code: 200, msg: 'ok', data: params }; }`,
                `}`,
                ``,
            ].join('\n'),
            'utf8'
        )

        await withGlobals(['config', 'msgs', 'log', 'db'], async () => {
            globalThis.__securityBoCtorCount = 0

            globalThis.config = { app: { lang: 'en' }, bo: { path: '../../BO/' } }
            globalThis.msgs = makeMsgs()
            globalThis.log = { TYPE_ERROR: 'error', show: () => {} }
            globalThis.db = {
                exe: async (schema, queryName) => {
                    if (schema !== 'security') throw new Error('wrong schema')
                    if (queryName === 'loadPermissions') return { rows: [] }
                    if (queryName === 'loadDataTx') return { rows: [] }
                    throw new Error(`Unexpected query: ${queryName}`)
                },
            }

            const security = new Security()
            await security.ready

            const r1 = await security.executeMethod({
                object_na: objectName,
                method_na: 'ping',
                params: { a: 1 },
            })
            const r2 = await security.executeMethod({
                object_na: objectName,
                method_na: 'ping',
                params: { a: 2 },
            })

            assert.deepEqual(r1, { code: 200, msg: 'ok', data: { a: 1 } })
            assert.deepEqual(r2, { code: 200, msg: 'ok', data: { a: 2 } })

            assert.equal(globalThis.__securityBoCtorCount, 1)
        })
    } finally {
        await fs.rm(baseDir, { recursive: true, force: true })
        delete globalThis.__securityBoCtorCount
    }
})

test('Security.executeMethod returns serverError and logs when BO import fails', async () => {
    await withGlobals(['config', 'msgs', 'log', 'db'], async () => {
        globalThis.config = { app: { lang: 'en' }, bo: { path: '../../BO/' } }
        globalThis.msgs = makeMsgs()

        const logs = []
        globalThis.log = { TYPE_ERROR: 'error', show: (e) => logs.push(e) }

        globalThis.db = {
            exe: async (schema, queryName) => {
                if (schema !== 'security') throw new Error('wrong schema')
                if (queryName === 'loadPermissions') return { rows: [] }
                if (queryName === 'loadDataTx') return { rows: [] }
                throw new Error(`Unexpected query: ${queryName}`)
            },
        }

        const security = new Security()
        await security.ready

        const r = await security.executeMethod({
            object_na: 'DoesNotExist',
            method_na: 'nope',
            params: {},
        })
        assert.deepEqual(r, globalThis.msgs.en.errors.server.serverError)
        assert.ok(logs.some((l) => String(l?.msg ?? '').includes('Security.executeMethod')))
    })
})
