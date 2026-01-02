export default class Security {
    ctx?: AppContext

    private permissionKey(profileId: unknown, method: unknown, object: unknown) {
        return `${String(profileId)}_${String(method)}_${String(object)}`
    }

    private instanceKey(object: unknown, method: unknown) {
        return `${String(object)}_${String(method)}`
    }

    permission: Map<string, true>
    txMap: Map<unknown, { object_na: string; method_na: string }>
    instances: Map<string, any>
    serverErrors: any

    isReady: boolean
    initError: any
    ready: Promise<any>

    /** @param {AppContext=} ctx */
    constructor(ctx?: AppContext) {
        this.ctx = ctx
        const effectiveConfig = this.ctx?.config ?? config
        const effectiveMsgs = this.ctx?.msgs ?? msgs

        this.permission = new Map()
        this.txMap = new Map()
        this.instances = new Map()
        this.serverErrors = effectiveMsgs[effectiveConfig.app.lang].errors.server

        this.isReady = false
        this.initError = null
        this.ready = this.init()
        // Ensure startup failures don't become unhandled rejections.
        this.ready.catch(() => {})
    }

    async init() {
        const effectiveLog = this.ctx?.log ?? log
        try {
            await Promise.all([this.loadPermissions(), this.loadDataTx()])
            this.isReady = true
            return true
        } catch (err: any) {
            this.initError = err
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.init: ${err?.message || err}`,
            })
            throw err
        }
    }

    async loadPermissions() {
        const effectiveDb = this.ctx?.db ?? db
        const effectiveLog = this.ctx?.log ?? log
        try {
            const r = await effectiveDb.exe('security', 'loadPermissions', null)
            if (!r || !r.rows) throw new Error('loadPermissions returned null')
            ;(r.rows as Array<{ profile_id: unknown; method_na: unknown; object_na: unknown }>).forEach(
                (el) => {
                    const key = this.permissionKey(el.profile_id, el.method_na, el.object_na)
                    this.permission.set(key, true)
                }
            )
            return true
        } catch (err: any) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.loadPermissions: ${err?.message || err}`,
            })
            throw err
        }
    }

    getPermissions(jsonData: {
        profile_id: unknown
        method_na: unknown
        object_na: unknown
    }): boolean {
        const key = this.permissionKey(jsonData.profile_id, jsonData.method_na, jsonData.object_na)
        return this.permission.has(key)
    }

    async loadDataTx() {
        const effectiveDb = this.ctx?.db ?? db
        const effectiveLog = this.ctx?.log ?? log
        try {
            const r = await effectiveDb.exe('security', 'loadDataTx', null)
            if (!r || !r.rows) throw new Error('loadDataTx returned null')
            ;(r.rows as Array<{ tx_nu: unknown; object_na: unknown; method_na: unknown }>).forEach(
                (el) => {
                    const key = el.tx_nu
                    const value = {
                        object_na: String(el.object_na),
                        method_na: String(el.method_na),
                    }
                    this.txMap.set(key, value)
                }
            )
            return true
        } catch (err: any) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.loadDataTx: ${err?.message || err}`,
            })
            throw err
        }
    }

    getDataTx(tx: unknown): { object_na: string; method_na: string } | null {
        return this.txMap.get(tx) ?? null
    }

    async executeMethod(jsonData: { object_na: unknown; method_na: unknown; params: any }) {
        const effectiveConfig = this.ctx?.config ?? config
        const effectiveLog = this.ctx?.log ?? log
        try {
            const key = this.instanceKey(jsonData.object_na, jsonData.method_na)
            if (this.instances.has(key)) {
                const instance = this.instances.get(key)
                return await instance[String(jsonData.method_na)](jsonData.params)
            } else {
                const objectName = String(jsonData.object_na)
                const modulePath = `${effectiveConfig.bo.path}${objectName}/${objectName}BO.js`
                const c: any = await import(modulePath)
                const instance = new c[`${objectName}BO`]()
                this.instances.set(key, instance)
                return await instance[String(jsonData.method_na)](jsonData.params)
            }
        } catch (err: any) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.executeMethod: ${err?.message || err}`,
                ctx: {
                    object_na: jsonData?.object_na,
                    method_na: jsonData?.method_na,
                    key:
                        jsonData?.object_na && jsonData?.method_na
                            ? this.instanceKey(jsonData.object_na, jsonData.method_na)
                            : undefined,
                    modulePath: jsonData?.object_na
                        ? `${effectiveConfig.bo.path}${String(jsonData.object_na)}/${String(
                              jsonData.object_na
                          )}BO.js`
                        : undefined,
                },
            })
            return this.serverErrors.serverError
        }
    }
}
