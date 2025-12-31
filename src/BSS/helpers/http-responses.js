export function sendInvalidParameters(res, invalidParametersError, alerts) {
    return res.status(invalidParametersError.code).send({
        msg: invalidParametersError.msg,
        code: invalidParametersError.code,
        alerts
    })
}
