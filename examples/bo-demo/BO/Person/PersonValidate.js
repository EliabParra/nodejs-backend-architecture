import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const labels = require('./errors/personAlerts.json')[config.app.lang].labels

export class PersonValidate {
    static LOOKUP_ID = 'id'
    static LOOKUP_NAME = 'name'

    static normalizeId(value) {
        return typeof value === 'string' ? Number(value) : value
    }

    static normalizeName(value) {
        return typeof value === 'string' ? value.trim() : value
    }

    static validate({ person_id, person_na, person_ln }) {
        if (!person_id) return this.validateNameAndLastName({ person_na, person_ln })
        const pid = this.normalizeId(person_id)
        return v.validateAll(
            [
                { value: pid, label: labels.person_id },
                { value: person_na, min: 3, max: 30, label: labels.person_na },
                { value: person_ln, min: 3, max: 30, label: labels.person_ln },
            ],
            ['int', 'length', 'length']
        )
    }

    static getLookupValue(input) {
        if (input && typeof input === 'object' && !Array.isArray(input)) {
            if (input.person_id != null) return input.person_id
            if (input.person_na != null) return input.person_na
            if (input.value != null) return input.value
        }
        return input
    }

    static getLookupMode(value) {
        const raw = this.getLookupValue(value)

        const num = this.normalizeId(raw)
        if (v.validateInt({ value: num, label: labels.person_id })) return this.LOOKUP_ID

        const name = this.normalizeName(raw)
        if (
            typeof name === 'string' &&
            v.validateLength({ value: name, label: labels.person_na }, 3, 30)
        )
            return this.LOOKUP_NAME

        return null
    }

    static validateId(value) {
        const num = this.normalizeId(value)
        return v.validateInt({ value: num, label: labels.person_id })
    }
    static validateName(value) {
        const name = this.normalizeName(value)
        return v.validateLength({ value: name, label: labels.person_na }, 3, 30)
    }
    static validateLastName(value) {
        const ln = this.normalizeName(value)
        return v.validateLength({ value: ln, label: labels.person_ln }, 3, 30)
    }
    static validateNameAndLastName({ person_na, person_ln }) {
        return v.validateAll(
            [
                { value: person_na, min: 3, max: 30, label: labels.person_na },
                { value: person_ln, min: 3, max: 30, label: labels.person_ln },
            ],
            ['length', 'length']
        )
    }
}
