import 'colors'

export default class Log {
    constructor() {
        this.TYPE_ERROR = 0
        this.TYPE_INFO = 1
        this.TYPE_DEBUG = 2
        this.TYPE_WARNING = 3
        this.activation = config.log.activation
        this.format = (config?.log?.format ?? 'text')
    }

    show(params) {
        const isJson = String(this.format).toLowerCase() === 'json'

        const typeToLevel = (t) => {
            switch (t) {
                case this.TYPE_ERROR: return 'error'
                case this.TYPE_WARNING: return 'warn'
                case this.TYPE_DEBUG: return 'debug'
                case this.TYPE_INFO:
                default: return 'info'
            }
        }

        const isActiveForType = (t) => {
            switch (t) {
                case this.TYPE_ERROR: return Boolean(this.activation?.[0])
                case this.TYPE_INFO: return Boolean(this.activation?.[1])
                case this.TYPE_DEBUG: return Boolean(this.activation?.[2])
                case this.TYPE_WARNING: return Boolean(this.activation?.[3])
                default: return true
            }
        }

        const safeSerializeCtx = (ctx) => {
            if (!ctx || typeof ctx !== 'object') return undefined
            try {
                // Ensure JSON-safe ctx (avoid throwing on circular refs)
                JSON.stringify(ctx)
                return ctx
            } catch {
                return '[unserializable]'
            }
        }

        switch(typeof params) {
            case 'string':
                if (isJson) {
                    console.log(JSON.stringify({
                        time: new Date().toISOString(),
                        level: 'info',
                        msg: params
                    }))
                } else {
                    console.log(params)
                }
                break
            case 'object':
                {
                    const level = typeToLevel(params.type)
                    if (!isActiveForType(params.type)) break

                    if (isJson) {
                        console.log(JSON.stringify({
                            time: new Date().toISOString(),
                            level,
                            msg: params.msg,
                            ctx: safeSerializeCtx(params.ctx)
                        }))
                        break
                    }

                    const ctx = params.ctx
                    let ctxText = ''
                    if (ctx && typeof ctx === 'object') {
                        try { ctxText = ` | ctx=${JSON.stringify(ctx)}` } catch { ctxText = ' | ctx=[unserializable]' }
                    }
                switch(params.type) {
                    case this.TYPE_ERROR: 
                        if (this.activation[0]) console.log("[MESSAGE]: ".white + `${params.msg}${ctxText} - TYPE: Error`.red)
                        break
                    case this.TYPE_WARNING:
                        if (this.activation[3]) console.log("[MESSAGE]: ".white + `${params.msg}${ctxText} - TYPE: Warning`.yellow)
                        break
                    case this.TYPE_INFO: 
                        if (this.activation[1]) console.log("[MESSAGE]: ".white + `${params.msg}${ctxText} - TYPE: Info`.blue)
                        break
                    case this.TYPE_DEBUG: 
                        if (this.activation[2]) console.log("[MESSAGE]: ".white + `${params.msg}${ctxText} - TYPE: Debug`.magenta)
                        break
                }
                break
                }
        }
    }
}