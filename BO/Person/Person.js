import { PersonErrorHandler } from "./errors/PersonErrorHandler.js"
import { PersonValidate } from "./PersonValidate.js"
const serverErrorMsg = msgs[config.app.lang].errors.server.serverError.msg

export class Person {
    constructor(params) {
        this.person_id = params?.person_id
        this.person_na = params.person_na
        this.person_ln = params.person_ln
    }

    static async get(value) {
        try {
            if (!PersonValidate.isIdOrNameLookup(value, ['getPerson', 'getPersonByName'])) return PersonErrorHandler.PersonInvalidParameters(v.getAlerts())
            const r = await db.exe('enterprise', PersonValidate.isIdOrNameLookup(value, ['getPerson', 'getPersonByName']), [value])
            if (r.rows.length === 0) return PersonErrorHandler.PersonNotFound()
            const person = new Person(r.rows[0])
            person.code = 200
            return person
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${serverErrorMsg}, Person.get: ${err?.message || err}` })
            return PersonErrorHandler.UnknownError()
        }
    }

    static async create(params) {
        try {
            if (!PersonValidate.validate(params)) return PersonErrorHandler.PersonInvalidParameters(v.getAlerts())
            await db.exe('enterprise', 'createPerson', params)
            return { code: 201 }
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${serverErrorMsg}, Person.create: ${err?.message || err}` })
            return PersonErrorHandler.UnknownError()
        }
    }

    static async update(params) {
        try {
            if (!PersonValidate.validate(params)) return PersonErrorHandler.PersonInvalidParameters(v.getAlerts())
            await db.exe('enterprise', 'updatePerson', params)
            return { code: 200 }
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${serverErrorMsg}, Person.update: ${err?.message || err}` })
            return PersonErrorHandler.UnknownError()
        }
    }

    static async delete(value) {
        try {
            if (!PersonValidate.isIdOrNameLookup(value, ['deletePerson', 'deletePersonByName'])) return PersonErrorHandler.PersonInvalidParameters(v.getAlerts())
            await db.exe('enterprise', PersonValidate.isIdOrNameLookup(value, ['deletePerson', 'deletePersonByName']), [value])
            return { code: 200 }
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `${serverErrorMsg}, Person.delete: ${err?.message || err}` })
            return PersonErrorHandler.UnknownError()
        }
    }
}