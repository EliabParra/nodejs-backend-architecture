import test from 'node:test'
import assert from 'node:assert/strict'

import { parseArgs } from '../scripts/db-init.mjs'

test('parseArgs parses flags and values', () => {
  const { args, opts } = parseArgs(['--print', '--sessionSchema', 'security', 'extra', '--yes'])
  assert.deepEqual(args, ['extra'])
  assert.equal(opts.print, true)
  assert.equal(opts.sessionSchema, 'security')
  assert.equal(opts.yes, true)
})
