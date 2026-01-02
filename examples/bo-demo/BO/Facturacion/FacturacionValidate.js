import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const labels = require('./errors/facturacionAlerts.json')[config.app.lang].labels

/*
FacturacionValidate

Guía rápida:
- Mantén la validación aquí (no en el BO) para que sea reutilizable.
- Usa el validator global [0m(v)[0m y retorna boolean. Si retorna false, el BO puede responder invalidParameters con v.getAlerts().
 - Usa el validator global (v) y retorna boolean. Si retorna false, el BO puede responder invalidParameters con v.getAlerts().
- Prefiere normalizar (trim/casteos) antes de persistir.
*/

export class FacturacionValidate {
    static normalizeId(value) {
        return typeof value === 'string' ? Number(value) : value
    }

    static normalizeText(value) {
        return typeof value === 'string' ? value.trim() : value
    }

    static validateId(value) {
        const num = this.normalizeId(value)
        return v.validateInt({ value: num, label: labels.id })
    }

    static validateName(value, { min = 1, max = 200 } = {}) {
        const name = this.normalizeText(value)
        if (typeof name !== 'string') return v.validateString({ value: name, label: labels.name })
        return v.validateLength({ value: name, label: labels.name }, min, max)
    }

    // Ejemplo de patrón genérico: un lookup puede ser por id o por nombre.
    // Ajusta esto según tu entidad.
    static getLookupMode(value) {
        if (this.validateId(value)) return 'id'
        if (this.validateName(value)) return 'name'
        return null
    }
}
