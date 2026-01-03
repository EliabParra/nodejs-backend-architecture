import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

type AuthLabels = {
    identifier: string
    email: string
    username: string
    password: string
    token: string
    code: string
    newPassword: string
}

const labels = require('./messages/authAlerts.json')[config.app.lang].labels as AuthLabels

export class AuthValidate {
    static normalizeText(value: string | null | undefined): string | undefined {
        if (typeof value !== 'string') return undefined
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
    }

    static validateIdentifier(value: string | null | undefined): boolean {
        const id = this.normalizeText(value)
        if (!id) return v.validateString({ value: id, label: labels.identifier })
        return v.validateLength({ value: id, label: labels.identifier }, 3, 320)
    }

    static validateEmail(value: string | null | undefined): boolean {
        const email = this.normalizeText(value)
        if (!email) return v.validateString({ value: email, label: labels.email })
        return v.validateEmail({ value: email, label: labels.email })
    }

    static validateUsername(
        value: string | null | undefined,
        { min = 3, max = 64 }: { min?: number; max?: number } = {}
    ): boolean {
        const username = this.normalizeText(value)
        if (!username) return v.validateString({ value: username, label: labels.username })
        return v.validateLength({ value: username, label: labels.username }, min, max)
    }

    static validatePassword(
        value: string | null | undefined,
        { min = 8, max = 200 }: { min?: number; max?: number } = {}
    ): boolean {
        const pw = this.normalizeText(value)
        if (!pw) return v.validateString({ value: pw, label: labels.password })
        return v.validateLength({ value: pw, label: labels.password }, min, max)
    }

    static validateToken(value: string | null | undefined): boolean {
        const token = this.normalizeText(value)
        if (!token) return v.validateString({ value: token, label: labels.token })
        return v.validateLength({ value: token, label: labels.token }, 16, 256)
    }

    static validateCode(value: string | null | undefined): boolean {
        const code = this.normalizeText(value)
        if (!code) return v.validateString({ value: code, label: labels.code })
        return v.validateLength({ value: code, label: labels.code }, 4, 12)
    }

    static validateNewPassword(
        value: string | null | undefined,
        { min = 8, max = 200 }: { min?: number; max?: number } = {}
    ): boolean {
        const pw = this.normalizeText(value)
        if (!pw) return v.validateString({ value: pw, label: labels.newPassword })
        return v.validateLength({ value: pw, label: labels.newPassword }, min, max)
    }
}
