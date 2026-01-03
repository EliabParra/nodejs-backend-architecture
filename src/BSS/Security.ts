export default class Security {
    ctx?: AppContext

    private permissionKey(profileId: number, method: string, object: string) {
        return `${profileId}_${method}_${object}`
    }

    private instanceKey(object: string, method: string) {
        return `${object}_${method}`
    }

    permission: Map<string, true>
    txMap: Map<number, { object_na: string; method_na: string }>
    instances: Map<string, Record<string, unknown>>
    serverErrors: { serverError: ApiError } & Record<string, ApiError>

    isReady: boolean
    initError: unknown
    ready: Promise<boolean>

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

    async init(): Promise<boolean> {
        const effectiveLog = this.ctx?.log ?? log
        try {
            await Promise.all([this.loadPermissions(), this.loadDataTx()])
            this.isReady = true
            return true
        } catch (err: unknown) {
            this.initError = err
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.init: ${err instanceof Error ? err.message : String(err)}`,
            })
            throw err
        }
    }

    async loadPermissions(): Promise<boolean> {
        const effectiveDb = this.ctx?.db ?? db
        const effectiveLog = this.ctx?.log ?? log
        try {
            type PermissionRow = { profile_id: number; method_na: string; object_na: string }
            const r = (await effectiveDb.exe('security', 'loadPermissions', null)) as {
                rows?: PermissionRow[]
            }
            if (!r?.rows) throw new Error('loadPermissions returned null')
            r.rows.forEach((el) => {
                const key = this.permissionKey(el.profile_id, el.method_na, el.object_na)
                this.permission.set(key, true)
            })
            return true
        } catch (err: unknown) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.loadPermissions: ${err instanceof Error ? err.message : String(err)}`,
            })
            throw err
        }
    }

    getPermissions(jsonData: {
        profile_id: number
        method_na: string
        object_na: string
    }): boolean {
        const key = this.permissionKey(jsonData.profile_id, jsonData.method_na, jsonData.object_na)
        return this.permission.has(key)
    }

    async loadDataTx(): Promise<boolean> {
        const effectiveDb = this.ctx?.db ?? db
        const effectiveLog = this.ctx?.log ?? log
        try {
            type TxRow = { tx_nu: number | string; object_na: string; method_na: string }
            const r = (await effectiveDb.exe('security', 'loadDataTx', null)) as { rows?: TxRow[] }
            if (!r?.rows) throw new Error('loadDataTx returned null')
            r.rows.forEach((el) => {
                const tx = typeof el.tx_nu === 'number' ? el.tx_nu : Number(el.tx_nu)
                if (!Number.isFinite(tx)) return
                this.txMap.set(tx, { object_na: el.object_na, method_na: el.method_na })
            })
            return true
        } catch (err: unknown) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.loadDataTx: ${err instanceof Error ? err.message : String(err)}`,
            })
            throw err
        }
    }

    getDataTx(tx: unknown): { object_na: string; method_na: string } | false {
        const key = typeof tx === 'number' ? tx : Number(tx)
        if (!Number.isFinite(key)) return false
        return this.txMap.get(key) ?? false
    }

    async executeMethod(jsonData: {
        object_na: string
        method_na: string
        params: Record<string, unknown> | null | undefined
    }): Promise<ApiError> {
        const effectiveConfig = this.ctx?.config ?? config
        const effectiveLog = this.ctx?.log ?? log

        function isModuleNotFound(err: unknown): boolean {
            const code =
                err && typeof err === 'object' && 'code' in err
                    ? (err as { code?: unknown }).code
                    : undefined
            if (code === 'ERR_MODULE_NOT_FOUND') return true
            // Best-effort fallback for environments that don't set `code`.
            const msg =
                err && typeof err === 'object' && 'message' in err
                    ? String((err as { message?: unknown }).message ?? '')
                    : ''
            return msg.includes('Cannot find module') || msg.includes('ERR_MODULE_NOT_FOUND')
        }

        async function importBoModule(
            modulePathJs: string,
            modulePathTs: string
        ): Promise<Record<string, unknown>> {
            try {
                return (await import(modulePathJs)) as Record<string, unknown>
            } catch (err: unknown) {
                if (!isModuleNotFound(err)) throw err
                return (await import(modulePathTs)) as Record<string, unknown>
            }
        }
        try {
            const key = this.instanceKey(jsonData.object_na, jsonData.method_na)
            if (this.instances.has(key)) {
                const instance = this.instances.get(key)
                const fn = instance?.[jsonData.method_na]
                if (typeof fn !== 'function') {
                    throw new Error(
                        `BO method not found: ${jsonData.object_na}.${jsonData.method_na}`
                    )
                }
                return (await (
                    fn as (p: Record<string, unknown> | null | undefined) => Promise<ApiError>
                )(jsonData.params)) as ApiError
            } else {
                const objectName = jsonData.object_na
                const basePath = `${effectiveConfig.bo.path}${objectName}/${objectName}BO`
                const modulePathJs = `${basePath}.js`
                const modulePathTs = `${basePath}.ts`
                const mod = await importBoModule(modulePathJs, modulePathTs)
                const ctor = mod[`${objectName}BO`]
                if (typeof ctor !== 'function') {
                    throw new Error(`BO class not found: ${objectName}BO`)
                }
                const instance = new (ctor as new () => Record<string, unknown>)()
                this.instances.set(key, instance)
                const fn = instance?.[jsonData.method_na]
                if (typeof fn !== 'function') {
                    throw new Error(`BO method not found: ${objectName}.${jsonData.method_na}`)
                }
                return (await (
                    fn as (p: Record<string, unknown> | null | undefined) => Promise<ApiError>
                )(jsonData.params)) as ApiError
            }
        } catch (err: unknown) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.executeMethod: ${err instanceof Error ? err.message : String(err)}`,
                ctx: {
                    object_na: jsonData.object_na,
                    method_na: jsonData.method_na,
                    key: this.instanceKey(jsonData.object_na, jsonData.method_na),
                    modulePath: `${effectiveConfig.bo.path}${jsonData.object_na}/${jsonData.object_na}BO.js (fallback .ts)`,
                },
            })
            return this.serverErrors.serverError
        }
    }
}
