import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const labels = require('./messages/authAlerts.json')[config.app.lang].labels;
export class AuthValidate {
    static normalizeText(value) {
        if (typeof value !== 'string')
            return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    static validateIdentifier(value) {
        const id = this.normalizeText(value);
        if (!id)
            return v.validateString({ value: id, label: labels.identifier });
        return v.validateLength({ value: id, label: labels.identifier }, 3, 320);
    }
    static validateEmail(value) {
        const email = this.normalizeText(value);
        if (!email)
            return v.validateString({ value: email, label: labels.email });
        return v.validateEmail({ value: email, label: labels.email });
    }
    static validateUsername(value, { min = 3, max = 64 } = {}) {
        const username = this.normalizeText(value);
        if (!username)
            return v.validateString({ value: username, label: labels.username });
        return v.validateLength({ value: username, label: labels.username }, min, max);
    }
    static validatePassword(value, { min = 8, max = 200 } = {}) {
        const pw = this.normalizeText(value);
        if (!pw)
            return v.validateString({ value: pw, label: labels.password });
        return v.validateLength({ value: pw, label: labels.password }, min, max);
    }
    static validateToken(value) {
        const token = this.normalizeText(value);
        if (!token)
            return v.validateString({ value: token, label: labels.token });
        return v.validateLength({ value: token, label: labels.token }, 16, 256);
    }
    static validateCode(value) {
        const code = this.normalizeText(value);
        if (!code)
            return v.validateString({ value: code, label: labels.code });
        return v.validateLength({ value: code, label: labels.code }, 4, 12);
    }
    static validateNewPassword(value, { min = 8, max = 200 } = {}) {
        const pw = this.normalizeText(value);
        if (!pw)
            return v.validateString({ value: pw, label: labels.newPassword });
        return v.validateLength({ value: pw, label: labels.newPassword }, min, max);
    }
}
