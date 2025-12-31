import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

test('bo CLI help prints usage and does not touch DB', () => {
  const r = spawnSync(process.execPath, ['scripts/bo.mjs', 'help'], {
    cwd: repoRoot,
    encoding: 'utf8'
  })

  assert.equal(r.status, 0)
  assert.match(r.stdout, /BO CLI/)

  const combined = `${r.stdout}\n${r.stderr}`
  assert.doesNotMatch(combined, /Error al consultar la base de datos/i)
  assert.doesNotMatch(combined, /Security\.(init|loadPermissions|loadDataTx)/)
})
