import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

async function pathExists(p) {
    try {
        await fs.stat(p)
        return true
    } catch {
        return false
    }
}

test('bo CLI auth --dry does not write files', async () => {
    const targetDir = path.join(repoRoot, 'BO', 'Auth')

    // Do not delete real workspace BOs during tests.
    // If the BO exists (because it's committed or generated), --dry must not modify it.
    const existedBefore = await pathExists(targetDir)
    const beforeListing = existedBefore ? await fs.readdir(targetDir) : null

    const r = spawnSync(process.execPath, ['scripts/bo.mjs', 'auth', '--dry'], {
        cwd: repoRoot,
        encoding: 'utf8',
    })

    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /DRY RUN: would create/i)
    assert.match(r.stdout, /Created BO Auth/i)

    const existsAfter = await pathExists(targetDir)
    assert.equal(existsAfter, existedBefore)
    if (existedBefore) {
        const afterListing = await fs.readdir(targetDir)
        assert.deepEqual(afterListing, beforeListing)
    }
})
