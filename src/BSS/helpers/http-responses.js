/**
 * Sends a standardized `invalidParameters` response.
 *
 * @param {AppResponse} res
 * @param {ApiError} invalidParametersError
 * @param {string[]} alerts
 */
export function sendInvalidParameters(res, invalidParametersError, alerts) {
    return res.status(invalidParametersError.code).send({
        msg: invalidParametersError.msg,
        code: invalidParametersError.code,
        alerts
    })
}
