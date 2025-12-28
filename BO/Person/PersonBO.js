import { Person } from "./Person.js"

export class PersonBO {
    async getPerson(value) {
        const result = await Person.get(value)
        if (result.code !== 200) return result
        return { data: result, msg: `Persona ${result.person_na} ${result.person_ln} encontrada`, code: result.code }
    }

    async createPerson(params) {
        const result = await Person.create(params)
        if (result.code !== 201) return result
        return { data: params, msg: `Persona ${params.person_na} ${params.person_ln} creada exitosamente`, code: result.code }
    }

    async updatePerson(params) {
        const result = await Person.update(params)
        if (result.code !== 200) return result
        return { data: params, msg: `Persona ${params.person_na} ${params.person_ln} actualizada exitosamente`, code: result.code }
    }

    async deletePerson(params) {
        const result = await Person.delete(params)
        if (result.code !== 200) return result
        return { data: params, msg: `Persona ${params.person_na} ${params.person_ln} eliminada exitosamente`, code: result.code }
    }
}