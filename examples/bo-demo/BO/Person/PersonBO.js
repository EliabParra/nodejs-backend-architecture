import { createRequire } from 'node:module'
import { PersonRepository } from './Person.js'
import { PersonValidate } from './PersonValidate.js'
import { PersonErrorHandler } from './errors/PersonErrorHandler.js'

const require = createRequire(import.meta.url)
const successMsgs = require('./personSuccessMsgs.json')[config.app.lang]
const serverErrorMsg = msgs[config.app.lang].errors.server.serverError.msg

export class PersonBO {
    async getPerson(value) {
        try {
            const mode = PersonValidate.getLookupMode(value)
            if (!mode) return PersonErrorHandler.PersonInvalidParameters(v.getAlerts())

            const raw = PersonValidate.getLookupValue(value)
            const lookupValue =
                mode === PersonValidate.LOOKUP_ID
                    ? PersonValidate.normalizeId(raw)
                    : PersonValidate.normalizeName(raw)

            const person =
                mode === PersonValidate.LOOKUP_ID
                    ? await PersonRepository.getById(lookupValue)
                    : await PersonRepository.getByName(lookupValue)

            if (!person) return PersonErrorHandler.PersonNotFound()

            const msg = successMsgs.getPerson
                .replace('{person_na}', person.person_na)
                .replace('{person_ln}', person.person_ln)

            return { code: 200, msg, data: person }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `${serverErrorMsg}, PersonBO.getPerson: ${err?.message || err}`,
            })
            return PersonErrorHandler.UnknownError()
        }
    }

    async createPerson(params) {
        try {
            if (!PersonValidate.validateNameAndLastName(params ?? {})) {
                return PersonErrorHandler.PersonInvalidParameters(v.getAlerts())
            }

            const person_na = PersonValidate.normalizeName(params.person_na)
            const person_ln = PersonValidate.normalizeName(params.person_ln)
            await PersonRepository.create({ person_na, person_ln })

            const msg = successMsgs.createPerson
                .replace('{person_na}', person_na)
                .replace('{person_ln}', person_ln)

            return { code: 201, msg, data: { person_na, person_ln } }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `${serverErrorMsg}, PersonBO.createPerson: ${err?.message || err}`,
            })
            return PersonErrorHandler.UnknownError()
        }
    }

    async updatePerson(params) {
        try {
            if (!PersonValidate.validate(params ?? {})) {
                return PersonErrorHandler.PersonInvalidParameters(v.getAlerts())
            }

            const person_id = PersonValidate.normalizeId(params.person_id)
            const person_na = PersonValidate.normalizeName(params.person_na)
            const person_ln = PersonValidate.normalizeName(params.person_ln)
            await PersonRepository.update({ person_id, person_na, person_ln })

            const msg = successMsgs.updatePerson
                .replace('{person_na}', person_na)
                .replace('{person_ln}', person_ln)

            return { code: 200, msg, data: { person_id, person_na, person_ln } }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `${serverErrorMsg}, PersonBO.updatePerson: ${err?.message || err}`,
            })
            return PersonErrorHandler.UnknownError()
        }
    }

    async deletePerson(value) {
        try {
            const mode = PersonValidate.getLookupMode(value)
            if (!mode) return PersonErrorHandler.PersonInvalidParameters(v.getAlerts())

            const raw = PersonValidate.getLookupValue(value)
            const lookupValue =
                mode === PersonValidate.LOOKUP_ID
                    ? PersonValidate.normalizeId(raw)
                    : PersonValidate.normalizeName(raw)

            if (mode === PersonValidate.LOOKUP_ID) await PersonRepository.deleteById(lookupValue)
            else await PersonRepository.deleteByName(lookupValue)

            return { code: 200, msg: successMsgs.deletePerson, data: { value: lookupValue } }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `${serverErrorMsg}, PersonBO.deletePerson: ${err?.message || err}`,
            })
            return PersonErrorHandler.UnknownError()
        }
    }
}
