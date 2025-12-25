export default class Security {
    constructor() {
        this.permission = new Map()
        this.txMap = new Map()
        this.instances = new Map()
        this.loadPermissions()
        this.loadDataTx()
    }

    loadPermissions() {
        try {
            db.exe("security", "loadPermissions", null).then(r => {
                r.rows.forEach(el => {
                    const key = `${el.profile_id}_${el.method_na}_${el.object_na}`
                    this.permission.set(key, true)
                })
            })
        } catch (err) { log.show({ type: log.TYPE_ERROR, msg: `Exception in Security.loadPermissions: ${err.message}` }) }
    }

    getPermissions(jsonData) {
        const key = `${jsonData.profile_id}_${jsonData.method_na}_${jsonData.object_na}`
        if (this.permission.has(key)) return this.permission.get(key)
        else return false
    }

    loadDataTx() {
        try {
            db.exe("security", "loadDataTx", null).then(r => {
                r.rows.forEach(el => {
                    const key = el.tx_nu
                    const value = { object_na: el.object_na, method_na: el.method_na }
                    this.txMap.set(key, value)
                })
            })
        } catch (err) { log.show({ type: log.TYPE_ERROR, msg: `Exception in Security.loadDataTx: ${err.message}` }) }
    }

    getDataTx(tx) {
        if (this.txMap.has(tx)) return this.txMap.get(tx)
        else return false
    }

    async executeMethod(jsonData) {
        try {
            const key = `${jsonData.object_na}_${jsonData.method_na}`
            if (this.instances.has(key)) {
                const instance = this.instances.get(key)
                return await instance[jsonData.method_na](jsonData.params)
            } else {
                const c = require(`${config.bo.path}${jsonData.object_na}.js`)
                const instance = new c[jsonData.object_na]()
                this.instances.set(key, instance)
                return await instance[jsonData.method_na](jsonData.params)
            }
        } catch (err) { log.show({ type: log.TYPE_ERROR, msg: `Exception in Security.executeMethod: ${err.message}` }) }
    }
}