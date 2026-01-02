import 'colors'

type LogEvent = {
    type: unknown
    msg?: unknown
    ctx?: unknown
}

export default class Log {
    TYPE_ERROR: number
    TYPE_INFO: number
    TYPE_DEBUG: number
    TYPE_WARNING: number

    activation: any
    format: unknown

    constructor() {
        this.TYPE_ERROR = 0
        this.TYPE_INFO = 1
        this.TYPE_DEBUG = 2
        this.TYPE_WARNING = 3
        this.activation = (config as any).log.activation
        this.format = (config as any)?.log?.format ?? 'text'
    }

    show(params: unknown) {
        const isJson = String(this.format).toLowerCase() === 'json'

        const typeToLevel = (t: unknown) => {
            switch (t) {
                case this.TYPE_ERROR:
                    return 'error'
                case this.TYPE_WARNING:
                    return 'warn'
                case this.TYPE_DEBUG:
                    return 'debug'
                case this.TYPE_INFO:
                default:
                    return 'info'
            }
        }

        const isActiveForType = (t: unknown) => {
            switch (t) {
                case this.TYPE_ERROR:
                    return Boolean(this.activation?.[0])
                case this.TYPE_INFO:
                    return Boolean(this.activation?.[1])
                case this.TYPE_DEBUG:
                    return Boolean(this.activation?.[2])
                case this.TYPE_WARNING:
                    return Boolean(this.activation?.[3])
                default:
                    return true
            }
        }

        const safeSerializeCtx = (ctx: unknown) => {
            if (!ctx || typeof ctx !== 'object') return undefined
            try {
                JSON.stringify(ctx)
                return ctx
            } catch {
                return '[unserializable]'
            }
        }

        switch (typeof params) {
            case 'string':
                if (isJson) {
                    console.log(
                        JSON.stringify({
                            time: new Date().toISOString(),
                            level: 'info',
                            msg: params,
                        })
                    )
                } else {
                    console.log(params)
                }
                break
            case 'object': {
                const e = params as LogEvent
                const level = typeToLevel(e.type)
                if (!isActiveForType(e.type)) break

                if (isJson) {
                    console.log(
                        JSON.stringify({
                            time: new Date().toISOString(),
                            level,
                            msg: e.msg,
                            ctx: safeSerializeCtx(e.ctx),
                        })
                    )
                    break
                }

                const ctx = e.ctx
                let ctxText = ''
                if (ctx && typeof ctx === 'object') {
                    try {
                        ctxText = ` | ctx=${JSON.stringify(ctx)}`
                    } catch {
                        ctxText = ' | ctx=[unserializable]'
                    }
                }
                switch (e.type) {
                    case this.TYPE_ERROR:
                        if (this.activation[0])
                            console.log(
                                '[MESSAGE]: '.white + `${String(e.msg)}${ctxText} - TYPE: Error`.red
                            )
                        break
                    case this.TYPE_WARNING:
                        if (this.activation[3])
                            console.log(
                                '[MESSAGE]: '.white +
                                    `${String(e.msg)}${ctxText} - TYPE: Warning`.yellow
                            )
                        break
                    case this.TYPE_INFO:
                        if (this.activation[1])
                            console.log(
                                '[MESSAGE]: '.white + `${String(e.msg)}${ctxText} - TYPE: Info`.blue
                            )
                        break
                    case this.TYPE_DEBUG:
                        if (this.activation[2])
                            console.log(
                                '[MESSAGE]: '.white +
                                    `${String(e.msg)}${ctxText} - TYPE: Debug`.magenta
                            )
                        break
                }
                break
            }
        }
    }
}
