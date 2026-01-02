export function jsonBodySyntaxErrorHandler(err: any, req: AppRequest, res: AppResponse, next: any) {
    const status = err?.status ?? err?.statusCode
    const isEntityParseFailed = err?.type === 'entity.parse.failed'
    const isSyntaxError = err instanceof SyntaxError
    const looksLikeJsonParseError = status === 400 && (isEntityParseFailed || isSyntaxError)

    if (!looksLikeJsonParseError) return next(err)

    const alert = (msgs as any)[(config as any).app.lang].alerts.invalidJson.replace(
        '{value}',
        'body'
    )
    return res
        .status((msgs as any)[(config as any).app.lang].errors.client.invalidParameters.code)
        .send({
            msg: (msgs as any)[(config as any).app.lang].errors.client.invalidParameters.msg,
            code: (msgs as any)[(config as any).app.lang].errors.client.invalidParameters.code,
            alerts: [alert],
        })
}
