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

test('bo CLI new --dry does not write files', async () => {
  const objectName = `ZzBoDry${Date.now()}`
  const targetDir = path.join(repoRoot, 'BO', objectName)

  assert.equal(await pathExists(targetDir), false)

  const r = spawnSync(process.execPath, ['scripts/bo.js', 'new', objectName, '--dry'], {
    cwd: repoRoot,
    encoding: 'utf8'
  })

  assert.equal(r.status, 0)
  assert.match(r.stdout, /DRY RUN: would create/i)
  assert.match(r.stdout, new RegExp(`BO\\\\${objectName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`))
  assert.equal(await pathExists(targetDir), false)
})

test('bo CLI sync --dry --txStart does not touch DB', () => {
  const r = spawnSync(process.execPath, ['scripts/bo.js', 'sync', 'Person', '--dry', '--txStart', '9000'], {
    cwd: repoRoot,
    encoding: 'utf8'
  })

  assert.equal(r.status, 0)
  assert.match(r.stdout, /DRY RUN: would upsert methods/i)

  const combined = `${r.stdout}\n${r.stderr}`
  assert.doesNotMatch(combined, /Error al consultar la base de datos/i)
})
