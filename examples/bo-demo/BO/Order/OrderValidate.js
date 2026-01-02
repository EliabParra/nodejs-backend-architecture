import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const labels = require('./errors/orderAlerts.json')[config.app.lang].labels

export class OrderValidate {
    static normalizeId(value) {
        return typeof value === 'string' ? Number(value) : value
    }
    static normalizeName(value) {
        return typeof value === 'string' ? value.trim() : value
    }

    static getLookupMode(value) {
        const num = this.normalizeId(value)
        if (v.validateInt({ value: num, label: labels.id })) return 'id'

        const name = this.normalizeName(value)
        if (
            typeof name === 'string' &&
            v.validateLength({ value: name, label: labels.name }, 1, 200)
        )
            return 'name'

        return null
    }
}
