export function jsonBodySyntaxErrorHandler(err, req, res, next) {
    const status = err?.status ?? err?.statusCode;
    const isEntityParseFailed = err?.type === 'entity.parse.failed';
    const isSyntaxError = err instanceof SyntaxError;
    const looksLikeJsonParseError = status === 400 && (isEntityParseFailed || isSyntaxError);
    if (!looksLikeJsonParseError)
        return next(err);
    const alert = msgs[config.app.lang].alerts.invalidJson.replace('{value}', 'body');
    return res
        .status(msgs[config.app.lang].errors.client.invalidParameters.code)
        .send({
        msg: msgs[config.app.lang].errors.client.invalidParameters.msg,
        code: msgs[config.app.lang].errors.client.invalidParameters.code,
        alerts: [alert],
    });
}
