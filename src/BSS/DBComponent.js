import { Pool } from 'pg'

function sqlMaxParamIndex(sql) {
    if (typeof sql !== 'string') return 0
    let max = 0
    const re = /\$(\d+)/g
    let m
    while ((m = re.exec(sql)) != null) {
        const n = Number(m[1])
        if (Number.isInteger(n) && n > max) max = n
    }
    return max
}

function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val)
}

function buildParamsArray(params) {
    const paramsArray = []
    if (Array.isArray(params)) paramsArray.push(...params)
    else if (isPlainObject(params)) for (let attr in params) paramsArray.push(params[attr])
    else paramsArray.push(params)
    return paramsArray
}

function prepareNamedParams(sql, paramsObj, orderKeys, opts = {}) {
    const options = {
        strict: true,
        enforceSqlArity: true,
        ...opts
    }

    if (!isPlainObject(paramsObj)) {
        throw new Error('exeNamed params must be an object')
    }
    if (!Array.isArray(orderKeys) || orderKeys.length === 0) {
        throw new Error('exeNamed orderKeys must be a non-empty array')
    }

    const missing = orderKeys.filter(k => !(k in paramsObj))
    if (missing.length > 0) {
        throw new Error(`Missing params: ${missing.join(', ')}`)
    }

    if (options.strict) {
        const allowed = new Set(orderKeys)
        const extras = Object.keys(paramsObj).filter(k => !allowed.has(k))
        if (extras.length > 0) {
            throw new Error(`Unexpected params: ${extras.join(', ')}`)
        }
    }

    const paramsArray = orderKeys.map(k => paramsObj[k])

    if (options.enforceSqlArity) {
        const expected = sqlMaxParamIndex(sql)
        if (expected !== paramsArray.length) {
            throw new Error(`Params/orderKeys length (${paramsArray.length}) does not match SQL placeholder count (${expected})`)
        }
    }

    return paramsArray
}

export default class DBComponent {
    constructor() {
        this.pool = new Pool(config.db)
        this.serverErrors = msgs[config.app.lang].errors.server
    }

    async exe(schema, query, params) {
        let client
        try {
            const paramsArray = buildParamsArray(params)

            client = await this.pool.connect()
            const res = await client.query(queries[schema][query], paramsArray)
            return res
        } catch (e) {
            const msg = `${this.serverErrors.dbError.msg}, DBComponent.exe: ${e?.message || e}`
            log.show({ type: log.TYPE_ERROR, msg })
            const err = new Error(this.serverErrors.dbError.msg)
            err.code = this.serverErrors.dbError.code
            err.cause = e
            throw err
        } finally {
            try { client?.release?.() } catch { }
        }
    }

    // Safer alternative to passing an object directly:
    // you provide the explicit param order, so you can catch ordering/shape issues early.
    async exeNamed(schema, query, paramsObj, orderKeys, opts) {
        let client
        try {
            const sql = queries?.[schema]?.[query]
            if (typeof sql !== 'string') throw new Error(`Query not found: ${schema}.${query}`)

            const paramsArray = prepareNamedParams(sql, paramsObj, orderKeys, opts)
            client = await this.pool.connect()
            return await client.query(sql, paramsArray)
        } catch (e) {
            const msg = `${this.serverErrors.dbError.msg}, DBComponent.exeNamed: ${e?.message || e}`
            log.show({ type: log.TYPE_ERROR, msg })
            const err = new Error(this.serverErrors.dbError.msg)
            err.code = this.serverErrors.dbError.code
            err.cause = e
            throw err
        } finally {
            try { client?.release?.() } catch { }
        }
    }
}

export { sqlMaxParamIndex, buildParamsArray, prepareNamedParams }