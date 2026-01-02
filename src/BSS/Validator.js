export default class Validator {
    constructor() {
        this.status = {}
        this.alerts = []
        this.msgs = msgs[config.app.lang].alerts
    }

    getStatus() {
        return this.status
    }
    getAlerts() {
        return this.alerts
    }

    validateInt(param) {
        const value = this.extractValue(param)
        if (!isNaN(value) && parseInt(value) === value && value > 0) return true
        this.alerts = [this.getMessage('int', param)]
        return false
    }
    validateReal(param) {
        const value = this.extractValue(param)
        if (!isNaN(value) && parseFloat(value) === value) return true
        this.alerts = [this.getMessage('real', param)]
        return false
    }
    validateString(param) {
        const value = this.extractValue(param)
        if (typeof value === 'string') return true
        this.alerts = [this.getMessage('string', param)]
        return false
    }
    validateLength(param, min, max) {
        if (!this.validateString(param)) return false

        if (min == null) min = 0
        else if (!this.validateInt(min)) return false

        if (max == null) max = Number.MAX_SAFE_INTEGER
        else if (!this.validateInt(max)) return false

        const value = this.extractValue(param)
        if (value.length >= min && value.length <= max) return true
        this.alerts = [
            this.getMessage('lengthRange', param).replace('{min}', min).replace('{max}', max),
        ]
        return false
    }
    validateEmail(param) {
        const value = this.extractValue(param)
        if (/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(value))
            return true
        this.alerts = [this.getMessage('email', param)]
        return false
    }
    validateNotEmpty(param) {
        const value = this.extractValue(param)
        if (value !== '') return true
        this.alerts = [this.getMessage('notEmpty', param)]
        return false
    }
    validateBoolean(param) {
        const value = this.extractValue(param)
        if (typeof value === 'boolean') return true
        this.alerts = [this.getMessage('boolean', param)]
        return false
    }
    validateDate(param) {
        const value = this.extractValue(param)
        if (!isNaN(new Date(value).getTime())) return true
        this.alerts = [this.getMessage('date', param)]
        return false
    }
    validateArray(param) {
        const value = this.extractValue(param)
        if (Array.isArray(value)) return true
        this.alerts = [this.getMessage('array', param)]
        return false
    }
    validateArrayNotEmpty(param) {
        const value = this.extractValue(param)
        if (Array.isArray(value) && value.length > 0) return true
        this.alerts = [this.getMessage('arrayNotEmpty', param)]
        return false
    }
    validateObject(param) {
        const value = this.extractValue(param)
        if (typeof value === 'object') return true
        this.alerts = [this.getMessage('object', param)]
        return false
    }
    validateObjectNotEmpty(param) {
        const value = this.extractValue(param)
        if (typeof value === 'object' && Object.keys(value).length > 0) return true
        this.alerts = [this.getMessage('objectNotEmpty', param)]
        return false
    }

    validate(value, type) {
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

    validateAll(params, types) {
        let flag = true
        let sts = new Array(params.length)

        if (!this.validateArrayNotEmpty(types) || !this.validateArrayNotEmpty(params)) {
            this.status = { result: false, alerts: ['Parámetros o tipos inválidos'] }
            return false
        }
        types = types.map((type) => type.toLowerCase())

        for (let i = 0; i < params.length; i++) {
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

    getMessage(type, param) {
        const value = this.formatValue(type, param)
        switch (type) {
            case 'length': {
                const min = param?.min
                const max = param?.max
                if (min != null && max != null) {
                    return this.msgs.lengthRange
                        .replace('{value}', value)
                        .replace('{min}', min)
                        .replace('{max}', max)
                }
                if (min != null) {
                    return this.msgs.lengthMin.replace('{value}', value).replace('{min}', min)
                }
                if (max != null) {
                    return this.msgs.lengthMax.replace('{value}', value).replace('{max}', max)
                }
                return this.msgs.lengthRange
                    .replace('{value}', value)
                    .replace('{min}', 0)
                    .replace('{max}', Number.MAX_SAFE_INTEGER)
            }
            default: {
                let msg = this.msgs[type].replace('{value}', value)
                if (param?.min != null) msg = msg.replace('{min}', param.min)
                if (param?.max != null) msg = msg.replace('{max}', param.max)
                return msg
            }
        }
    }

    formatValue(type, param) {
        if (typeof param === 'object' && param !== null) {
            if (param.label != null) return param.label
            if (type === 'length') return param.value
            try {
                return JSON.stringify(param)
            } catch {
                return String(param)
            }
        }
        if (Array.isArray(param))
            try {
                return JSON.stringify(param)
            } catch {
                return String(param)
            }
        return param
    }

    extractValue(param) {
        if (typeof param === 'object' && param !== null && 'value' in param) return param.value
        return param
    }
}
