import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const errorMsgs = require('./authErrorMsgs.json')[config.app.lang]

export class AuthErrorHandler {
    static invalidParameters(alerts) {
        const { code, msg } = errorMsgs.invalidParameters
        return { code, msg, alerts: alerts ?? [] }
    }

    static invalidToken() {
        return errorMsgs.invalidToken
    }
    static expiredToken() {
        return errorMsgs.expiredToken
    }
    static tooManyRequests() {
        return errorMsgs.tooManyRequests
    }
    static alreadyRegistered() {
        return errorMsgs.alreadyRegistered
    }
    static emailNotVerified() {
        return errorMsgs.emailNotVerified
    }
    static unknownError() {
        return errorMsgs.unknownError
    }
}
