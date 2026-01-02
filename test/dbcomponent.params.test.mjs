import test from 'node:test'
import assert from 'node:assert/strict'

import { sqlMaxParamIndex, buildParamsArray, prepareNamedParams } from '../src/BSS/DBComponent.js'

test('sqlMaxParamIndex detects highest $n placeholder', () => {
    assert.equal(sqlMaxParamIndex('select $1, $2, $2, $10'), 10)
    assert.equal(sqlMaxParamIndex('select 1'), 0)
})

test('buildParamsArray supports array/object/single value', () => {
    assert.deepEqual(buildParamsArray(undefined), [])
    assert.deepEqual(buildParamsArray(null), [])
    assert.deepEqual(buildParamsArray([1, 2]), [1, 2])
    assert.deepEqual(buildParamsArray({ a: 1, b: 2 }), [1, 2])
    assert.deepEqual(buildParamsArray(5), [5])
})

test('prepareNamedParams builds stable ordered array from object', () => {
    const sql = 'select $1, $2'
    const paramsObj = { b: 2, a: 1 }
    const orderKeys = ['a', 'b']
    assert.deepEqual(prepareNamedParams(sql, paramsObj, orderKeys), [1, 2])
})

test('prepareNamedParams fails on missing keys', () => {
    const sql = 'select $1, $2'
    assert.throws(() => prepareNamedParams(sql, { a: 1 }, ['a', 'b']), /Missing params: b/)
})

test('prepareNamedParams fails on extra keys (strict)', () => {
    const sql = 'select $1'
    assert.throws(() => prepareNamedParams(sql, { a: 1, b: 2 }, ['a']), /Unexpected params: b/)
})

test('prepareNamedParams fails when SQL placeholder count does not match', () => {
    const sql = 'select $1, $2'
    assert.throws(
        () => prepareNamedParams(sql, { a: 1 }, ['a'], { strict: true, enforceSqlArity: true }),
        /does not match SQL placeholder count/i
    )
})
