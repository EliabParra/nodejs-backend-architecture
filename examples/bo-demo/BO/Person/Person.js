export class Person {
    constructor(params) {
        this.person_id = params?.person_id
        this.person_na = params.person_na
        this.person_ln = params.person_ln
    }
}

export class PersonRepository {
    static async getById(person_id) {
        const r = await db.exe('enterprise', 'getPerson', [person_id])
        if (!r?.rows || r.rows.length === 0) return null
        return new Person(r.rows[0])
    }

    static async getByName(person_na) {
        const r = await db.exe('enterprise', 'getPersonByName', [person_na])
        if (!r?.rows || r.rows.length === 0) return null
        return new Person(r.rows[0])
    }

    static async create({ person_na, person_ln }) {
        await db.exeNamed('enterprise', 'createPerson', { person_na, person_ln }, ['person_na', 'person_ln'])
        return true
    }

    static async update({ person_id, person_na, person_ln }) {
        await db.exeNamed('enterprise', 'updatePerson', { person_id, person_na, person_ln }, ['person_id', 'person_na', 'person_ln'])
        return true
    }

    static async deleteById(person_id) {
        await db.exe('enterprise', 'deletePerson', [person_id])
        return true
    }

    static async deleteByName(person_na) {
        await db.exe('enterprise', 'deletePersonByName', [person_na])
        return true
    }
}