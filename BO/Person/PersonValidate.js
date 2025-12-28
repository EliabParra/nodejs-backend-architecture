import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const labels = require('./errors/personAlerts.json')[config.app.lang].labels

export class PersonValidate {
    static ID = 0
    static NAME = 1

    static validate({ person_id, person_na, person_ln }) {
        if (!person_id) return this.validateNameAndLastName({ person_na, person_ln })
        const pid = typeof person_id === 'string' ? Number(person_id) : person_id
        return v.validateAll([
            { value: pid, label: labels.person_id },
            { value: person_na, min: 3, max: 30, label: labels.person_na },
            { value: person_ln, min: 3, max: 30, label: labels.person_ln }
        ], ['int', 'length', 'length'])
    }

    static isIdOrNameLookup(value, sentences) {
        const num = typeof value === 'string' ? Number(value) : value
        if (v.validateInt({ value: num, label: labels.person_id })) return sentences[this.ID]
        else if (typeof value === 'string' && v.validateLength({ value, label: labels.person_na }, 3, 30)) return sentences[this.NAME]
        return false
    }

    static validateId(value) {
        const num = typeof value === 'string' ? Number(value) : value
        return v.validateInt({ value: num, label: labels.person_id })
    }
    static validateName(value) {
        return v.validateLength({ value, label: labels.person_na }, 3, 30)
    }
    static validateLastName(value) {
        return v.validateLength({ value, label: labels.person_ln }, 3, 30)
    }
    static validateNameAndLastName({ person_na, person_ln }) {
        return v.validateAll([
            { value: person_na, min: 3, max: 30, label: labels.person_na },
            { value: person_ln, min: 3, max: 30, label: labels.person_ln }
        ], ['length', 'length'])
    }
}