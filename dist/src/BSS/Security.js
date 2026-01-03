export default class Security {
    ctx;
    permissionKey(profileId, method, object) {
        return `${profileId}_${method}_${object}`;
    }
    instanceKey(object, method) {
        return `${object}_${method}`;
    }
    permission;
    txMap;
    instances;
    serverErrors;
    isReady;
    initError;
    ready;
    /** @param {AppContext=} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        const effectiveConfig = this.ctx?.config ?? config;
        const effectiveMsgs = this.ctx?.msgs ?? msgs;
        this.permission = new Map();
        this.txMap = new Map();
        this.instances = new Map();
        this.serverErrors = effectiveMsgs[effectiveConfig.app.lang].errors.server;
        this.isReady = false;
        this.initError = null;
        this.ready = this.init();
        // Ensure startup failures don't become unhandled rejections.
        this.ready.catch(() => { });
    }
    async init() {
        const effectiveLog = this.ctx?.log ?? log;
        try {
            await Promise.all([this.loadPermissions(), this.loadDataTx()]);
            this.isReady = true;
            return true;
        }
        catch (err) {
            this.initError = err;
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.init: ${err instanceof Error ? err.message : String(err)}`,
            });
            throw err;
        }
    }
    async loadPermissions() {
        const effectiveDb = this.ctx?.db ?? db;
        const effectiveLog = this.ctx?.log ?? log;
        try {
            const r = (await effectiveDb.exe('security', 'loadPermissions', null));
            if (!r?.rows)
                throw new Error('loadPermissions returned null');
            r.rows.forEach((el) => {
                const key = this.permissionKey(el.profile_id, el.method_na, el.object_na);
                this.permission.set(key, true);
            });
            return true;
        }
        catch (err) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.loadPermissions: ${err instanceof Error ? err.message : String(err)}`,
            });
            throw err;
        }
    }
    getPermissions(jsonData) {
        const key = this.permissionKey(jsonData.profile_id, jsonData.method_na, jsonData.object_na);
        return this.permission.has(key);
    }
    async loadDataTx() {
        const effectiveDb = this.ctx?.db ?? db;
        const effectiveLog = this.ctx?.log ?? log;
        try {
            const r = (await effectiveDb.exe('security', 'loadDataTx', null));
            if (!r?.rows)
                throw new Error('loadDataTx returned null');
            r.rows.forEach((el) => {
                const tx = typeof el.tx_nu === 'number' ? el.tx_nu : Number(el.tx_nu);
                if (!Number.isFinite(tx))
                    return;
                this.txMap.set(tx, { object_na: el.object_na, method_na: el.method_na });
            });
            return true;
        }
        catch (err) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.loadDataTx: ${err instanceof Error ? err.message : String(err)}`,
            });
            throw err;
        }
    }
    getDataTx(tx) {
        const key = typeof tx === 'number' ? tx : Number(tx);
        if (!Number.isFinite(key))
            return false;
        return this.txMap.get(key) ?? false;
    }
    async executeMethod(jsonData) {
        const effectiveConfig = this.ctx?.config ?? config;
        const effectiveLog = this.ctx?.log ?? log;
        function isModuleNotFound(err) {
            const code = err && typeof err === 'object' && 'code' in err
                ? err.code
                : undefined;
            if (code === 'ERR_MODULE_NOT_FOUND')
                return true;
            // Best-effort fallback for environments that don't set `code`.
            const msg = err && typeof err === 'object' && 'message' in err
                ? String(err.message ?? '')
                : '';
            return msg.includes('Cannot find module') || msg.includes('ERR_MODULE_NOT_FOUND');
        }
        async function importBoModule(modulePathJs, modulePathTs) {
            try {
                return (await import(modulePathJs));
            }
            catch (err) {
                if (!isModuleNotFound(err))
                    throw err;
                return (await import(modulePathTs));
            }
        }
        try {
            const key = this.instanceKey(jsonData.object_na, jsonData.method_na);
            if (this.instances.has(key)) {
                const instance = this.instances.get(key);
                const fn = instance?.[jsonData.method_na];
                if (typeof fn !== 'function') {
                    throw new Error(`BO method not found: ${jsonData.object_na}.${jsonData.method_na}`);
                }
                return (await fn(jsonData.params));
            }
            else {
                const objectName = jsonData.object_na;
                const basePath = `${effectiveConfig.bo.path}${objectName}/${objectName}BO`;
                const modulePathJs = `${basePath}.js`;
                const modulePathTs = `${basePath}.ts`;
                const mod = await importBoModule(modulePathJs, modulePathTs);
                const ctor = mod[`${objectName}BO`];
                if (typeof ctor !== 'function') {
                    throw new Error(`BO class not found: ${objectName}BO`);
                }
                const instance = new ctor();
                this.instances.set(key, instance);
                const fn = instance?.[jsonData.method_na];
                if (typeof fn !== 'function') {
                    throw new Error(`BO method not found: ${objectName}.${jsonData.method_na}`);
                }
                return (await fn(jsonData.params));
            }
        }
        catch (err) {
            effectiveLog.show({
                type: effectiveLog.TYPE_ERROR,
                msg: `${this.serverErrors.serverError.msg}, Security.executeMethod: ${err instanceof Error ? err.message : String(err)}`,
                ctx: {
                    object_na: jsonData.object_na,
                    method_na: jsonData.method_na,
                    key: this.instanceKey(jsonData.object_na, jsonData.method_na),
                    modulePath: `${effectiveConfig.bo.path}${jsonData.object_na}/${jsonData.object_na}BO.js (fallback .ts)`,
                },
            });
            return this.serverErrors.serverError;
        }
    }
}
