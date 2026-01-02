import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const labels = require('./errors/authAlerts.json')[config.app.lang].labels

export class AuthValidate {
    static normalizeText(value) {
        return typeof value === 'string' ? value.trim() : value
    }

    static validateIdentifier(value) {
        const id = this.normalizeText(value)
        if (typeof id !== 'string') return v.validateString({ value: id, label: labels.identifier })
        return v.validateLength({ value: id, label: labels.identifier }, 3, 320)
    }

    static validateEmail(value) {
        const email = this.normalizeText(value)
        if (typeof email !== 'string')
            return v.validateString({ value: email, label: labels.email })
        return v.validateEmail({ value: email, label: labels.email })
    }

    static validateUsername(value, { min = 3, max = 64 } = {}) {
        const username = this.normalizeText(value)
        if (typeof username !== 'string')
            return v.validateString({ value: username, label: labels.username })
        return v.validateLength({ value: username, label: labels.username }, min, max)
    }

    static validatePassword(value, { min = 8, max = 200 } = {}) {
        const pw = this.normalizeText(value)
        if (typeof pw !== 'string') return v.validateString({ value: pw, label: labels.password })
        return v.validateLength({ value: pw, label: labels.password }, min, max)
    }

    static validateToken(value) {
        const token = this.normalizeText(value)
        if (typeof token !== 'string')
            return v.validateString({ value: token, label: labels.token })
        return v.validateLength({ value: token, label: labels.token }, 16, 256)
    }

    static validateCode(value) {
        const code = this.normalizeText(value)
        if (typeof code !== 'string') return v.validateString({ value: code, label: labels.code })
        return v.validateLength({ value: code, label: labels.code }, 4, 12)
    }

    static validateNewPassword(value, { min = 8, max = 200 } = {}) {
        const pw = this.normalizeText(value)
        if (typeof pw !== 'string')
            return v.validateString({ value: pw, label: labels.newPassword })
        return v.validateLength({ value: pw, label: labels.newPassword }, min, max)
    }
}
