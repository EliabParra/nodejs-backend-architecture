export function isPlainObject(val: unknown): val is Record<string, any> {
    return val !== null && typeof val === 'object' && !Array.isArray(val)
}

/**
 * Validates the request body shape for `POST /toProccess`.
 */
export function validateToProccessSchema(body: unknown): string[] {
    const alerts: string[] = []

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
            typeof params === 'string' ||
            (typeof params === 'number' && Number.isFinite(params)) ||
            (params !== null && typeof params === 'object' && !Array.isArray(params))

        if (!isOk) {
            alerts.push(msgs[config.app.lang].alerts.paramsType.replace('{value}', 'params'))
        }
    }

    return alerts
}

/**
 * Validates the request body shape for `POST /login`.
 */
export function validateLoginSchema(
    body: unknown,
    { minPasswordLen }: { minPasswordLen?: number } = {}
): string[] {
    const alerts: string[] = []

    if (!isPlainObject(body)) {
        alerts.push(v.getMessage('object', { value: body, label: 'body' }))
        return alerts
    }

    if (typeof body.username !== 'string') {
        alerts.push(v.getMessage('string', { value: body.username, label: 'username' }))
    }

    if (typeof body.password !== 'string') {
        alerts.push(v.getMessage('string', { value: body.password, label: 'password' }))
    } else if (
        Number.isInteger(minPasswordLen) &&
        minPasswordLen > 0 &&
        body.password.length < minPasswordLen
    ) {
        alerts.push(
            v.getMessage('length', { value: body.password, label: 'password', min: minPasswordLen })
        )
    }

    return alerts
}

/**
 * Validates the request body shape for `POST /logout`.
 */
export function validateLogoutSchema(body: unknown): string[] {
    const alerts: string[] = []
    if (body == null) return alerts

    if (!isPlainObject(body)) {
        alerts.push(v.getMessage('object', { value: body, label: 'body' }))
    }

    return alerts
}

/**
 * Validates the request body shape for `POST /login/verify`.
 */
export function validateLoginVerifySchema(body: unknown): string[] {
    const alerts: string[] = []

    if (!isPlainObject(body)) {
        alerts.push(v.getMessage('object', { value: body, label: 'body' }))
        return alerts
    }

    if (typeof body.token !== 'string') {
        alerts.push(v.getMessage('string', { value: body.token, label: 'token' }))
    }
    if (typeof body.code !== 'string') {
        alerts.push(v.getMessage('string', { value: body.code, label: 'code' }))
    }

    return alerts
}

export type ToProccessBody = {
    tx: number
    params?: string | number | Record<string, unknown> | null
}

export type LoginBody = {
    username: string
    password: string
}

export type LoginVerifyBody = {
    token: string
    code: string
}

export type LogoutBody = Record<string, unknown> | null | undefined

export function parseToProccessBody(
    body: unknown
): { ok: true; body: ToProccessBody } | { ok: false; alerts: string[] } {
    const alerts = validateToProccessSchema(body)
    if (alerts.length > 0) return { ok: false, alerts }
    const b = body as { tx: number; params?: any }
    return { ok: true, body: { tx: b.tx, params: b.params } }
}

export function parseLoginBody(
    body: unknown,
    opts: { minPasswordLen?: number } = {}
): { ok: true; body: LoginBody } | { ok: false; alerts: string[] } {
    const alerts = validateLoginSchema(body, opts)
    if (alerts.length > 0) return { ok: false, alerts }
    const b = body as { username: string; password: string }
    return { ok: true, body: { username: b.username, password: b.password } }
}

export function parseLoginVerifyBody(
    body: unknown
): { ok: true; body: LoginVerifyBody } | { ok: false; alerts: string[] } {
    const alerts = validateLoginVerifySchema(body)
    if (alerts.length > 0) return { ok: false, alerts }
    const b = body as { token: string; code: string }
    return { ok: true, body: { token: b.token, code: b.code } }
}

export function parseLogoutBody(
    body: unknown
): { ok: true; body: LogoutBody } | { ok: false; alerts: string[] } {
    const alerts = validateLogoutSchema(body)
    if (alerts.length > 0) return { ok: false, alerts }
    return { ok: true, body: (body ?? null) as LogoutBody }
}
