import test from 'node:test'
import assert from 'node:assert/strict'

import { templateBO } from '../scripts/bo.js'

test('bo.templateBO mentions underscore helpers convention', () => {
  const out = templateBO('Order', ['getOrder'])
  assert.match(out, /pueden iniciar con "_"/)
  assert.match(out, /En sync se ignoran y no se registran en DB\./)
})
