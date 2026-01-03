import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

type ApiError = { code: number; msg: string; alerts?: string[] }
type AuthErrorKey =
    | 'invalidParameters'
    | 'invalidToken'
    | 'expiredToken'
    | 'tooManyRequests'
    | 'alreadyRegistered'
    | 'emailNotVerified'
    | 'unknownError'

const errorMsgs = require('./messages/authErrorMsgs.json')[config.app.lang] as Record<
    AuthErrorKey,
    ApiError
>

export class AuthErrorHandler {
    static invalidParameters(alerts?: string[]): ApiError {
        const { code, msg } = errorMsgs.invalidParameters
        return { code, msg, alerts: alerts ?? [] }
    }

    static invalidToken(): ApiError {
        return errorMsgs.invalidToken
    }
    static expiredToken(): ApiError {
        return errorMsgs.expiredToken
    }
    static tooManyRequests(): ApiError {
        return errorMsgs.tooManyRequests
    }
    static alreadyRegistered(): ApiError {
        return errorMsgs.alreadyRegistered
    }
    static emailNotVerified(): ApiError {
        return errorMsgs.emailNotVerified
    }
    static unknownError(): ApiError {
        return errorMsgs.unknownError
    }
}
