import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const personErrorMsgs = require('./personErrorMsgs.json')[config.app.lang]

export class PersonErrorHandler {
    static handle(respOrCode) {
        if (typeof respOrCode === 'object' && respOrCode?.code != null) return respOrCode
        const code = typeof respOrCode === 'number' ? respOrCode : respOrCode?.code
        switch(code) {
            case 400: return this.PersonInvalidParameters()
            case 401: return this.PersonUnauthorized()
            case 404: return this.PersonNotFound()
            default: return this.UnknownError()
        }
    }

    static PersonNotFound() {
        return personErrorMsgs.personNotFound
    }
    static PersonInvalidParameters(alerts) {
        const { code, msg } = personErrorMsgs.personInvalidParameters
        return { code, msg, alerts: alerts ?? [] }
    }
    static PersonUnauthorized() {
        return personErrorMsgs.personUnauthorized
    }
    static UnknownError() {
        return personErrorMsgs.unknownError
    }
}