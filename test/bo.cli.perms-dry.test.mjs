import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function stripAnsi(s) {
  return String(s).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

test('bo CLI perms --dry allow is DB-safe', () => {
  const r = spawnSync(
    process.execPath,
    ['scripts/bo.js', 'perms', '--profile', '1', '--allow', 'Person.getPerson,Order.createOrder', '--dry'],
    { cwd: repoRoot, encoding: 'utf8' }
  )

  assert.equal(r.status, 0)

  const combined = stripAnsi(`${r.stdout}\n${r.stderr}`)
  assert.doesNotMatch(combined, /Error al consultar la base de datos/i)
  assert.match(combined, /action:\s*'allow'/i)
  assert.match(combined, /Person/)
  assert.match(combined, /getPerson/)
})

test('bo CLI perms --dry deny is DB-safe', () => {
  const r = spawnSync(
    process.execPath,
    ['scripts/bo.js', 'perms', '--profile', '2', '--deny', 'Person.deletePerson', '--dry'],
    { cwd: repoRoot, encoding: 'utf8' }
  )

  assert.equal(r.status, 0)
  const combined = stripAnsi(`${r.stdout}\n${r.stderr}`)
  assert.doesNotMatch(combined, /Error al consultar la base de datos/i)
  assert.match(combined, /deny/i)
})

test('bo CLI perms rejects invalid method format', () => {
  const r = spawnSync(
    process.execPath,
    ['scripts/bo.js', 'perms', '--profile', '1', '--allow', 'BadFormat', '--dry'],
    { cwd: repoRoot, encoding: 'utf8' }
  )

  assert.equal(r.status, 1)
  assert.match(`${r.stdout}\n${r.stderr}`, /Invalid method format/i)
})

test('bo CLI perms rejects invalid profile', () => {
  const r = spawnSync(
    process.execPath,
    ['scripts/bo.js', 'perms', '--profile', '0', '--allow', 'Person.getPerson', '--dry'],
    { cwd: repoRoot, encoding: 'utf8' }
  )

  assert.equal(r.status, 1)
  assert.match(`${r.stdout}\n${r.stderr}`, /--profile must be a positive integer/i)
})
