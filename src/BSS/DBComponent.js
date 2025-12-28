import { Pool } from 'pg'

export default class DBComponent {
    constructor() {
        this.pool = new Pool(config.db)
        this.serverErrors = msgs[config.app.lang].errors.server
    }

    async exe(schema, query, params) {
        let client
        try {
            const paramsArray = []
            if (v.validateArray(params)) paramsArray.push(...params)
            else if (v.validateObject(params)) for (let attr in params) paramsArray.push(params[attr])
            else paramsArray.push(params)

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
}