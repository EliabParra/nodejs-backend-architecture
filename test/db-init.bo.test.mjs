import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

import { parseAsyncMethodsFromBO, discoverBOs } from '../scripts/db-init.ts'

test('parseAsyncMethodsFromBO extracts async methods and ignores _private', () => {
    const content = `
export class PersonBO {
  async getPerson(params) { return params }
  async _helper() { return null }
  async createPerson(params) { return params }
  notAsync() { return 1 }
}
`
    const methods = parseAsyncMethodsFromBO(content)
    assert.deepEqual(methods.sort(), ['createPerson', 'getPerson'])
})

test('discoverBOs finds BOs under repoRoot/BO', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'db-init-test-'))
    try {
        const boDir = path.join(tmp, 'BO', 'Order')
        await fs.mkdir(boDir, { recursive: true })
        await fs.writeFile(
            path.join(boDir, 'OrderBO.ts'),
            `export class OrderBO {\n  async getOrder() {}\n  async createOrder() {}\n  async _internal() {}\n}`,
            'utf8'
        )

        const found = await discoverBOs(tmp)
        assert.equal(found.length, 1)
        assert.equal(found[0].objectName, 'Order')
        assert.deepEqual(found[0].methods.sort(), ['createOrder', 'getOrder'])
    } finally {
        await fs.rm(tmp, { recursive: true, force: true })
    }
})
