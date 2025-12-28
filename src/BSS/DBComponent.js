import { Pool } from 'pg'

export default class DBComponent {
    constructor() {
        this.pool = new Pool(config.db)
        this.serverErrors = msgs[config.app.lang].errors.server
    }

    async exe(schema, query, params) {
        try {
            const paramsArray = []
            if (v.validateArray(params)) paramsArray.push(...params)
            else if (v.validateObject(params)) for (let attr in params) paramsArray.push(params[attr])
            else paramsArray.push(params)
            let client = await this.pool.connect()
            let res = await client.query(queries[schema][query], paramsArray)
            client.release()
            return res
        } catch (e) {
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.dbError.msg}, DBComponent.exe: ${e.message}` })
            return null
        }
    }
}