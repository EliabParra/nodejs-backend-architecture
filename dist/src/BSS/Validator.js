function isParamObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export default class Validator {
    status;
    alerts;
    msgs;
    constructor(config, msgs) {
        this.status = {};
        this.alerts = [];
        const cfg = config;
        const lang = String(cfg?.app?.lang ?? 'en');
        const allMsgs = msgs;
        const langMsgs = allMsgs?.[lang];
        const alerts = langMsgs && typeof langMsgs === 'object' && 'alerts' in langMsgs
            ? langMsgs.alerts
            : undefined;
        this.msgs = (alerts && typeof alerts === 'object' ? alerts : {});
    }
    getStatus() {
        return this.status;
    }
    getAlerts() {
        return this.alerts;
    }
    extractValue(param) {
        if (isParamObject(param))
            return param.value;
        return param;
    }
    formatValue(type, param) {
        if (isParamObject(param)) {
            if (typeof param.label === 'string')
                return param.label;
            if (type === 'length')
                return param.value;
            try {
                return JSON.stringify(param);
            }
            catch {
                return String(param);
            }
        }
        if (Array.isArray(param)) {
            try {
                return JSON.stringify(param);
            }
            catch {
                return String(param);
            }
        }
        return param;
    }
    getMessage(type, param) {
        const value = this.formatValue(type, param);
        switch (type) {
            case 'length': {
                const min = isParamObject(param) ? param.min : undefined;
                const max = isParamObject(param) ? param.max : undefined;
                if (min != null && max != null) {
                    return (this.msgs.lengthRange ?? '')
                        .replace('{value}', String(value))
                        .replace('{min}', String(min))
                        .replace('{max}', String(max));
                }
                if (min != null) {
                    return (this.msgs.lengthMin ?? '')
                        .replace('{value}', String(value))
                        .replace('{min}', String(min));
                }
                if (max != null) {
                    return (this.msgs.lengthMax ?? '')
                        .replace('{value}', String(value))
                        .replace('{max}', String(max));
                }
                return (this.msgs.lengthRange ?? '')
                    .replace('{value}', String(value))
                    .replace('{min}', '0')
                    .replace('{max}', String(Number.MAX_SAFE_INTEGER));
            }
            default: {
                let msg = (this.msgs[type] ?? '').replace('{value}', String(value));
                if (isParamObject(param) && param.min != null)
                    msg = msg.replace('{min}', String(param.min));
                if (isParamObject(param) && param.max != null)
                    msg = msg.replace('{max}', String(param.max));
                return msg;
            }
        }
    }
    validateInt(param) {
        const value = this.extractValue(param);
        if (typeof value === 'number' && Number.isInteger(value) && value > 0)
            return true;
        this.alerts = [this.getMessage('int', param)];
        return false;
    }
    validateReal(param) {
        const value = this.extractValue(param);
        if (typeof value === 'number' && Number.isFinite(value))
            return true;
        this.alerts = [this.getMessage('real', param)];
        return false;
    }
    validateString(param) {
        const value = this.extractValue(param);
        if (typeof value === 'string')
            return true;
        this.alerts = [this.getMessage('string', param)];
        return false;
    }
    validateLength(param, min, max) {
        if (!this.validateString(param))
            return false;
        const minValue = min == null ? 0 : this.extractValue(min);
        const minNum = typeof minValue === 'number' ? minValue : NaN;
        if (!Number.isInteger(minNum) || minNum < 0) {
            this.alerts = [this.getMessage('int', min ?? minValue)];
            return false;
        }
        const maxValue = max == null ? Number.MAX_SAFE_INTEGER : this.extractValue(max);
        const maxNum = typeof maxValue === 'number' ? maxValue : NaN;
        if (!Number.isInteger(maxNum) || maxNum < 0) {
            this.alerts = [this.getMessage('int', max ?? maxValue)];
            return false;
        }
        const value = this.extractValue(param);
        if (typeof value === 'string' && value.length >= minNum && value.length <= maxNum)
            return true;
        this.alerts = [
            this.getMessage('lengthRange', param)
                .replace('{min}', String(minNum))
                .replace('{max}', String(maxNum)),
        ];
        return false;
    }
    validateEmail(param) {
        const value = this.extractValue(param);
        if (/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(String(value)))
            return true;
        this.alerts = [this.getMessage('email', param)];
        return false;
    }
    validateNotEmpty(param) {
        const value = this.extractValue(param);
        if (value !== '')
            return true;
        this.alerts = [this.getMessage('notEmpty', param)];
        return false;
    }
    validateBoolean(param) {
        const value = this.extractValue(param);
        if (typeof value === 'boolean')
            return true;
        this.alerts = [this.getMessage('boolean', param)];
        return false;
    }
    validateDate(param) {
        const value = this.extractValue(param);
        if (value instanceof Date && !Number.isNaN(value.getTime()))
            return true;
        if ((typeof value === 'string' || typeof value === 'number') &&
            !Number.isNaN(new Date(value).getTime()))
            return true;
        this.alerts = [this.getMessage('date', param)];
        return false;
    }
    validateArray(param) {
        const value = this.extractValue(param);
        if (Array.isArray(value))
            return true;
        this.alerts = [this.getMessage('array', param)];
        return false;
    }
    validateArrayNotEmpty(param) {
        const value = this.extractValue(param);
        if (Array.isArray(value) && value.length > 0)
            return true;
        this.alerts = [this.getMessage('arrayNotEmpty', param)];
        return false;
    }
    validateObject(param) {
        const value = this.extractValue(param);
        if (value != null && typeof value === 'object')
            return true;
        this.alerts = [this.getMessage('object', param)];
        return false;
    }
    validateObjectNotEmpty(param) {
        const value = this.extractValue(param);
        if (value != null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.keys(value).length > 0)
            return true;
        this.alerts = [this.getMessage('objectNotEmpty', param)];
        return false;
    }
    validate(value, type) {
        switch (type) {
            case 'int':
                return this.validateInt(value);
            case 'real':
                return this.validateReal(value);
            case 'string':
                return this.validateString(value);
            case 'length':
                return this.validateLength(value, isParamObject(value) ? value.min : undefined, isParamObject(value) ? value.max : undefined);
            case 'email':
                return this.validateEmail(value);
            case 'notEmpty':
                return this.validateNotEmpty(value);
            case 'boolean':
                return this.validateBoolean(value);
            case 'date':
                return this.validateDate(value);
            case 'array':
                return this.validateArray(value);
            case 'arrayNotEmpty':
                return this.validateArrayNotEmpty(value);
            case 'object':
                return this.validateObject(value);
            case 'objectNotEmpty':
                return this.validateObjectNotEmpty(value);
            default:
                return false;
        }
    }
    validateAll(params, types) {
        let flag = true;
        const paramsArr = Array.isArray(params) ? params : [];
        const typesArr = Array.isArray(types) ? types : [];
        const sts = new Array(paramsArr.length);
        if (!this.validateArrayNotEmpty(typesArr) || !this.validateArrayNotEmpty(paramsArr)) {
            this.status = { result: false, alerts: ['Parámetros o tipos inválidos'] };
            return false;
        }
        const normalizedTypes = typesArr.map((t) => String(t).toLowerCase());
        for (let i = 0; i < paramsArr.length; i++) {
            if (!this.validateString(normalizedTypes[i])) {
                this.status = { result: false, alerts: ['Tipos inválidos'] };
                return false;
            }
            sts[i] = this.validate(paramsArr[i], normalizedTypes[i]);
            flag = flag && sts[i];
        }
        this.alerts = sts
            .map((s, i) => {
            if (!s)
                return this.getMessage(normalizedTypes[i], paramsArr[i]);
        })
            .filter((a) => a !== undefined);
        this.status = {
            result: flag,
            alerts: this.alerts,
        };
        return flag;
    }
}
