type ValidatorStatus = { result?: boolean; alerts?: string[]; [k: string]: unknown }

type ParamObject = {
    value?: unknown
    label?: unknown
    min?: unknown
    max?: unknown
    [k: string]: unknown
}

type ValidatorMessages = Record<string, string>

function isParamObject(value: unknown): value is ParamObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export default class Validator {
    status: ValidatorStatus
    alerts: string[]
    msgs: ValidatorMessages

    constructor() {
        this.status = {}
        this.alerts = []
        this.msgs = (msgs as any)[(config as any).app.lang].alerts
    }

    getStatus() {
        return this.status
    }

    getAlerts() {
        return this.alerts
    }

    private extractValue(param: unknown) {
        if (isParamObject(param) && 'value' in param) return (param as any).value
        return param
    }

    private formatValue(type: string, param: unknown) {
        if (isParamObject(param)) {
            if (param.label != null) return param.label
            if (type === 'length') return param.value
            try {
                return JSON.stringify(param)
            } catch {
                return String(param)
            }
        }
        if (Array.isArray(param)) {
            try {
                return JSON.stringify(param)
            } catch {
                return String(param)
            }
        }
        return param as any
    }

    getMessage(type: string, param: any) {
        const value = this.formatValue(type, param)
        switch (type) {
            case 'length': {
                const min = param?.min
                const max = param?.max
                if (min != null && max != null) {
                    return this.msgs.lengthRange
                        .replace('{value}', String(value))
                        .replace('{min}', String(min))
                        .replace('{max}', String(max))
                }
                if (min != null) {
                    return this.msgs.lengthMin
                        .replace('{value}', String(value))
                        .replace('{min}', String(min))
                }
                if (max != null) {
                    return this.msgs.lengthMax
                        .replace('{value}', String(value))
                        .replace('{max}', String(max))
                }
                return this.msgs.lengthRange
                    .replace('{value}', String(value))
                    .replace('{min}', '0')
                    .replace('{max}', String(Number.MAX_SAFE_INTEGER))
            }
            default: {
                let msg = this.msgs[type].replace('{value}', String(value))
                if (param?.min != null) msg = msg.replace('{min}', String(param.min))
                if (param?.max != null) msg = msg.replace('{max}', String(param.max))
                return msg
            }
        }
    }

    validateInt(param: any) {
        const value = this.extractValue(param)
        if (!isNaN(value as any) && parseInt(value as any) === value && (value as any) > 0)
            return true
        this.alerts = [this.getMessage('int', param)]
        return false
    }

    validateReal(param: any) {
        const value = this.extractValue(param)
        if (!isNaN(value as any) && parseFloat(value as any) === value) return true
        this.alerts = [this.getMessage('real', param)]
        return false
    }

    validateString(param: any) {
        const value = this.extractValue(param)
        if (typeof value === 'string') return true
        this.alerts = [this.getMessage('string', param)]
        return false
    }

    validateLength(param: any, min: any, max: any) {
        if (!this.validateString(param)) return false

        if (min == null) min = 0
        else if (!this.validateInt(min)) return false

        if (max == null) max = Number.MAX_SAFE_INTEGER
        else if (!this.validateInt(max)) return false

        const value = this.extractValue(param) as any
        if (value.length >= min && value.length <= max) return true
        this.alerts = [
            this.getMessage('lengthRange', param)
                .replace('{min}', String(min))
                .replace('{max}', String(max)),
        ]
        return false
    }

    validateEmail(param: any) {
        const value = this.extractValue(param)
        if (
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(
                String(value)
            )
        )
            return true
        this.alerts = [this.getMessage('email', param)]
        return false
    }

    validateNotEmpty(param: any) {
        const value = this.extractValue(param)
        if (value !== '') return true
        this.alerts = [this.getMessage('notEmpty', param)]
        return false
    }

    validateBoolean(param: any) {
        const value = this.extractValue(param)
        if (typeof value === 'boolean') return true
        this.alerts = [this.getMessage('boolean', param)]
        return false
    }

    validateDate(param: any) {
        const value = this.extractValue(param)
        if (!isNaN(new Date(value as any).getTime())) return true
        this.alerts = [this.getMessage('date', param)]
        return false
    }

    validateArray(param: any) {
        const value = this.extractValue(param)
        if (Array.isArray(value)) return true
        this.alerts = [this.getMessage('array', param)]
        return false
    }

    validateArrayNotEmpty(param: any) {
        const value = this.extractValue(param)
        if (Array.isArray(value) && value.length > 0) return true
        this.alerts = [this.getMessage('arrayNotEmpty', param)]
        return false
    }

    validateObject(param: any) {
        const value = this.extractValue(param)
        if (typeof value === 'object') return true
        this.alerts = [this.getMessage('object', param)]
        return false
    }

    validateObjectNotEmpty(param: any) {
        const value = this.extractValue(param)
        if (typeof value === 'object' && value != null && Object.keys(value as any).length > 0)
            return true
        this.alerts = [this.getMessage('objectNotEmpty', param)]
        return false
    }

    validate(value: any, type: string) {
        switch (type) {
            case 'int':
                return this.validateInt(value)
            case 'real':
                return this.validateReal(value)
            case 'string':
                return this.validateString(value)
            case 'length':
                return this.validateLength(value, value.min, value.max)
            case 'email':
                return this.validateEmail(value)
            case 'notEmpty':
                return this.validateNotEmpty(value)
            case 'boolean':
                return this.validateBoolean(value)
            case 'date':
                return this.validateDate(value)
            case 'array':
                return this.validateArray(value)
            case 'arrayNotEmpty':
                return this.validateArrayNotEmpty(value)
            case 'object':
                return this.validateObject(value)
            case 'objectNotEmpty':
                return this.validateObjectNotEmpty(value)
            default:
                return false
        }
    }

    validateAll(params: any, types: any) {
        let flag = true
        const sts = new Array((params as any).length)

        if (!this.validateArrayNotEmpty(types) || !this.validateArrayNotEmpty(params)) {
            this.status = { result: false, alerts: ['Parámetros o tipos inválidos'] }
            return false
        }
        types = (types as any).map((type: any) => String(type).toLowerCase())

        for (let i = 0; i < (params as any).length; i++) {
            if (!this.validateString(types[i])) {
                this.status = { result: false, alerts: ['Tipos inválidos'] }
                return false
            }
            sts[i] = this.validate(params[i], types[i])
            flag = flag && sts[i]
        }

        this.alerts = sts
            .map((s, i) => {
                if (!s) return this.getMessage(types[i], params[i])
            })
            .filter((a) => a !== undefined)

        this.status = {
            result: flag,
            alerts: this.alerts,
        }

        return flag
    }
}
