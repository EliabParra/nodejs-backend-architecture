export default class Security {
    constructor() {
        this.permission = new Map()
        this.txMap = new Map()
        this.instances = new Map()
        this.serverErrors = msgs[config.app.lang].errors.server

        this.isReady = false
        this.initError = null
        this.ready = this.init()
    }

    async init() {
        try {
            await Promise.all([
                this.loadPermissions(),
                this.loadDataTx()
            ])
            this.isReady = true
            return true
        } catch (err) {
            this.initError = err
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.serverError.msg}, Security.init: ${err?.message || err}` })
            throw err
        }
    }

    async loadPermissions() {
        try {
            const r = await db.exe("security", "loadPermissions", null)
            if (!r || !r.rows) throw new Error('loadPermissions returned null')
            r.rows.forEach(el => {
                const key = `${el.profile_id}_${el.method_na}_${el.object_na}`
                this.permission.set(key, true)
            })
            return true
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.serverError.msg}, Security.loadPermissions: ${err?.message || err}` })
            throw err
        }
    }

    getPermissions(jsonData) {
        const key = `${jsonData.profile_id}_${jsonData.method_na}_${jsonData.object_na}`
        if (this.permission.has(key)) return this.permission.get(key)
        else return false
    }

    async loadDataTx() {
        try {
            const r = await db.exe("security", "loadDataTx", null)
            if (!r || !r.rows) throw new Error('loadDataTx returned null')
            r.rows.forEach(el => {
                const key = el.tx_nu
                const value = { object_na: el.object_na, method_na: el.method_na }
                this.txMap.set(key, value)
            })
            return true
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.serverError.msg}, Security.loadDataTx: ${err?.message || err}` })
            throw err
        }
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
                const modulePath = `${config.bo.path}${jsonData.object_na}/${jsonData.object_na}BO.js`
                const c = await import(modulePath)
                const instance = new c[`${jsonData.object_na}BO`]()
                this.instances.set(key, instance)
                return await instance[jsonData.method_na](jsonData.params)
            }
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${this.serverErrors.serverError.msg}, Security.executeMethod: ${err.message}` })
            return this.serverErrors.serverError
        }
    }
}