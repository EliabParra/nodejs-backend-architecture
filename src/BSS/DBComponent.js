import { Pool } from 'pg'

export default class DBComponent {
    constructor() {
        this.pool = new Pool(config.db)
    }

    async exe(schema, query, params) {
        try {
            let client = await this.pool.connect()
            let res = await client.query(queries[schema][query], params)
            client.release()
            return res
        } catch (e) {
            log.show({ type: log.TYPE_ERROR, msg: `Exception in DBComponent.exe: ${e.message}` })
            return null
        }
    }
}