import test from 'node:test'
import assert from 'node:assert/strict'

import { parseArgs } from '../scripts/bo.ts'

test('bo.parseArgs parses flags and values', () => {
    const { args, opts } = parseArgs([
        'new',
        'Order',
        '--methods',
        'a,b',
        '--dry',
        '--txStart',
        '200',
    ])
    assert.deepEqual(args, ['new', 'Order'])
    assert.equal(opts.methods, 'a,b')
    assert.equal(opts.dry, true)
    assert.equal(opts.txStart, '200')
})
