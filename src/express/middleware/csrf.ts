import { randomBytes } from 'node:crypto'

export function ensureCsrfToken(req: AppRequest) {
    if (req.session == null) return null
    if (typeof req.session.csrfToken === 'string' && req.session.csrfToken.length > 0) {
        return req.session.csrfToken
    }
    const token = randomBytes(32).toString('hex')
    req.session.csrfToken = token
    return token
}

export function csrfTokenHandler(req: AppRequest, res: AppResponse) {
    const token = ensureCsrfToken(req)
    if (!token) {
        return res
            .status((msgs as any)[(config as any).app.lang].errors.client.unknown.code)
            .send((msgs as any)[(config as any).app.lang].errors.client.unknown)
    }
    return res.status(200).send({ csrfToken: token })
}

export function csrfProtection(req: AppRequest, res: AppResponse, next: any) {
    // Preserve previous semantics: if there's no authenticated session yet,
    // keep returning the existing 401 behavior for endpoints that already check auth.
    if (
        ((req as any).path === '/toProccess' || (req as any).path === '/logout') &&
        !req.session?.user_id
    ) {
        return next()
    }

    const expected = req.session?.csrfToken
    const provided = req.get?.('X-CSRF-Token')
    if (typeof expected !== 'string' || expected.length === 0) {
        return res
            .status((msgs as any)[(config as any).app.lang].errors.client.csrfInvalid.code)
            .send((msgs as any)[(config as any).app.lang].errors.client.csrfInvalid)
    }
    if (typeof provided !== 'string' || provided !== expected) {
        return res
            .status((msgs as any)[(config as any).app.lang].errors.client.csrfInvalid.code)
            .send((msgs as any)[(config as any).app.lang].errors.client.csrfInvalid)
    }
    return next()
}
