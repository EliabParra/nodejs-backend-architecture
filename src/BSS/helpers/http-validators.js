export function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val)
}

export function validateToProccessSchema(body) {
    const alerts = []

    if (!isPlainObject(body)) {
        alerts.push(v.getMessage('object', { value: body, label: 'body' }))
        return alerts
    }

    const tx = body.tx
    if (!Number.isInteger(tx) || tx <= 0) {
        alerts.push(v.getMessage('int', { value: tx, label: 'tx' }))
    }

    const params = body.params
    if (params !== undefined && params !== null) {
        const isOk =
            (typeof params === 'string') ||
            (typeof params === 'number' && Number.isFinite(params)) ||
            (params !== null && typeof params === 'object' && !Array.isArray(params))

        if (!isOk) {
            alerts.push(msgs[config.app.lang].alerts.paramsType.replace('{value}', 'params'))
        }
    }

    return alerts
}

export function validateLoginSchema(body, { minPasswordLen } = {}) {
    const alerts = []

    if (!isPlainObject(body)) {
        alerts.push(v.getMessage('object', { value: body, label: 'body' }))
        return alerts
    }

    if (typeof body.username !== 'string') {
        alerts.push(v.getMessage('string', { value: body.username, label: 'username' }))
    }

    if (typeof body.password !== 'string') {
        alerts.push(v.getMessage('string', { value: body.password, label: 'password' }))
    } else if (Number.isInteger(minPasswordLen) && minPasswordLen > 0 && body.password.length < minPasswordLen) {
        alerts.push(v.getMessage('length', { value: body.password, label: 'password', min: minPasswordLen }))
    }

    return alerts
}

export function validateLogoutSchema(body) {
    const alerts = []
    if (body == null) return alerts

    if (!isPlainObject(body)) {
        alerts.push(v.getMessage('object', { value: body, label: 'body' }))
    }

    return alerts
}
