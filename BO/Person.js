export class Person {
    constructor() {
        this.NAME = 0
        this.ID = 1
    }

    isIdOrNameLookup(value, sentences) {
        if (v.validateString(value)) return sentences[this.NAME]
        else if (v.validateInt(value)) return sentences[this.ID]
        return false
    }

    async getPerson(params) {
        try {
            if (!this.isIdOrNameLookup(params[0], ['getPersonByName', 'getPerson'])) return { msg: 'Parametros inválidos', alerts: v.getAlerts() }
            const r = await db.exe('enterprise', this.isIdOrNameLookup(params[0], ['getPersonByName', 'getPerson']), params)
            if (r.rows.length === 0) return { msg: 'Persona no encontrada' }
            return { msg: `Persona encontrada: ${r.rows[0].person_na} ${r.rows[0].person_ln}`, data: { name: r.rows[0].person_na, lastName: r.rows[0].person_ln } }
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `Error en Person.getPerson: ${err}` })
            return { msg: 'Error de servidor' }
        }
    }

    async createPerson(params) {
        try {
            if (!v.validateAll([params, params[0], params[1]], ['array', 'string', 'string'])) return { msg: 'Parametros inválidos', alerts: v.getAlerts() }
            await db.exe('enterprise', 'createPerson', params)
            return { msg: `Persona creada: ${params[0]} ${params[1]}`, data: { name: params[0], lastName: params[1] } }
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `Error en Person.createPerson: ${err.message}` })
            return { msg: 'Error de servidor' }
        }
    }

    async updatePerson(params) {
        try {
            if (!v.validateAll([params, params[0], params[1], params[2]], ['array', 'string', 'string', 'int'])) return { msg: 'Parametros inválidos', alerts: v.getAlerts() }
            await db.exe('enterprise', 'updatePerson', params)
            return { msg: `Persona actualizada: ${params[0]} ${params[1]}`, data: { name: params[0], lastName: params[1], id: params[2] } }
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `Error en Person.updatePerson: ${err.message}` })
            return { msg: 'Error de servidor' }
        }
    }

    async deletePerson(params) {
        try {
            if (!this.isIdOrNameLookup(params[0], ['deletePersonByName', 'deletePerson'])) return { msg: 'Parametros inválidos', alerts: v.getAlerts() }
            await db.exe('enterprise', this.isIdOrNameLookup(params[0], ['deletePersonByName', 'deletePerson']), params)
            return { msg: 'Persona eliminada' }
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `Error en Person.deletePerson: ${err.message}` })
            return { msg: 'Error de servidor' }
        }
    }
}