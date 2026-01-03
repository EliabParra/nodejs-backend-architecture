import { Pool } from 'pg';
export function sqlMaxParamIndex(sql) {
    if (typeof sql !== 'string')
        return 0;
    let max = 0;
    const re = /\$(\d+)/g;
    let m;
    while ((m = re.exec(sql)) != null) {
        const n = Number(m[1]);
        if (Number.isInteger(n) && n > max)
            max = n;
    }
    return max;
}
function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
}
export function buildParamsArray(params) {
    if (params == null)
        return [];
    const paramsArray = [];
    if (Array.isArray(params))
        paramsArray.push(...params);
    else if (isPlainObject(params))
        for (const attr in params)
            paramsArray.push(params[attr]);
    else
        paramsArray.push(params);
    return paramsArray;
}
export function prepareNamedParams(sql, paramsObj, orderKeys, opts = {}) {
    const options = {
        strict: true,
        enforceSqlArity: true,
        ...opts,
    };
    if (!isPlainObject(paramsObj)) {
        throw new Error('exeNamed params must be an object');
    }
    if (!Array.isArray(orderKeys) || orderKeys.length === 0) {
        throw new Error('exeNamed orderKeys must be a non-empty array');
    }
    const keys = orderKeys.map((k) => String(k));
    const missing = keys.filter((k) => !(k in paramsObj));
    if (missing.length > 0) {
        throw new Error(`Missing params: ${missing.join(', ')}`);
    }
    if (options.strict) {
        const allowed = new Set(keys);
        const extras = Object.keys(paramsObj).filter((k) => !allowed.has(k));
        if (extras.length > 0) {
            throw new Error(`Unexpected params: ${extras.join(', ')}`);
        }
    }
    const paramsArray = keys.map((k) => paramsObj[k]);
    if (options.enforceSqlArity) {
        const expected = sqlMaxParamIndex(sql);
        if (expected !== paramsArray.length) {
            throw new Error(`Params/orderKeys length (${paramsArray.length}) does not match SQL placeholder count (${expected})`);
        }
    }
    return paramsArray;
}
export default class DBComponent {
    pool;
    serverErrors;
    queries;
    log;
    constructor(deps) {
        const { config, msgs, queries, log } = deps;
        this.pool = new Pool(config.db);
        this.serverErrors = msgs[config.app.lang].errors.server;
        this.queries = queries;
        this.log = log;
    }
    async exeRaw(sql, params) {
        let client;
        try {
            if (typeof sql !== 'string' || sql.trim().length === 0) {
                throw new Error('exeRaw sql must be a non-empty string');
            }
            const paramsArray = buildParamsArray(params);
            client = await this.pool.connect();
            return await client.query(sql, paramsArray);
        }
        catch (e) {
            const msg = `${this.serverErrors.dbError.msg}, DBComponent.exeRaw: ${e?.message || e}`;
            this.log.show({ type: this.log.TYPE_ERROR, msg });
            const err = new Error(this.serverErrors.dbError.msg);
            err.code = this.serverErrors.dbError.code;
            err.cause = e;
            throw err;
        }
        finally {
            try {
                client?.release?.();
            }
            catch { }
        }
    }
    async exe(schema, query, params) {
        let client;
        try {
            const paramsArray = buildParamsArray(params);
            client = await this.pool.connect();
            const sql = this.queries[schema][query];
            const res = await client.query(sql, paramsArray);
            return res;
        }
        catch (e) {
            const msg = `${this.serverErrors.dbError.msg}, DBComponent.exe: ${e?.message || e}`;
            this.log.show({ type: this.log.TYPE_ERROR, msg });
            const err = new Error(this.serverErrors.dbError.msg);
            err.code = this.serverErrors.dbError.code;
            err.cause = e;
            throw err;
        }
        finally {
            try {
                client?.release?.();
            }
            catch { }
        }
    }
    // Safer alternative to passing an object directly:
    // you provide the explicit param order, so you can catch ordering/shape issues early.
    async exeNamed(schema, query, paramsObj, orderKeys, opts) {
        let client;
        try {
            const sql = this.queries?.[schema]?.[query];
            if (typeof sql !== 'string')
                throw new Error(`Query not found: ${schema}.${query}`);
            const paramsArray = prepareNamedParams(sql, paramsObj, orderKeys, opts);
            client = await this.pool.connect();
            return await client.query(sql, paramsArray);
        }
        catch (e) {
            const msg = `${this.serverErrors.dbError.msg}, DBComponent.exeNamed: ${e?.message || e}`;
            this.log.show({ type: this.log.TYPE_ERROR, msg });
            const err = new Error(this.serverErrors.dbError.msg);
            err.code = this.serverErrors.dbError.code;
            err.cause = e;
            throw err;
        }
        finally {
            try {
                client?.release?.();
            }
            catch { }
        }
    }
}
