/**
 * Sends a standardized `invalidParameters` response.
 */
export function sendInvalidParameters(
    res: AppResponse,
    invalidParametersError: ApiError,
    alerts: string[]
) {
    return res.status(invalidParametersError.code).send({
        msg: invalidParametersError.msg,
        code: invalidParametersError.code,
        alerts,
    })
}
