import { Person } from './model/Person.js'

export class PersonBO {
    constructor() {}

    getAll() {
        return new Promise(async (resolve, reject) => {
            try {
                const r = await db.exe('enterprise', 'getAllPerson')
                resolve(r.rows.map(row => new Person(row)))
            } catch (error) {
                log.show({ type: log.TYPE_ERROR, msg: `Error en Person.getAll: ${error.message}` })
                reject(error)
            }
        })
    }

    get(params) {
        
    }

    getById(id) {
        return new Promise(async (resolve, reject) => {
            try {
                const r = await db.exe('enterprise', 'getPerson', id)
                if (r.rows.length === 0) return reject(new PersonNotFound('Person not found'))
                resolve(new Person(r.rows[0]))
            } catch (error) {
                log.show({ type: log.TYPE_ERROR, msg: `Error en Person.getById: ${error.message}` })
                reject(error)
            }
        })
    }

    getByName(name) {
        return new Promise(async (resolve, reject) => {
            try {
                const r = await db.exe('enterprise', 'getPersonByName', name)
                if (r.rows.length === 0) return reject(new PersonNotFound('Person not found'))
                resolve(new Person(r.rows[0]))
            } catch (error) {
                log.show({ type: log.TYPE_ERROR, msg: `Error en Person.getByName: ${error.message}` })
                reject(error)
            }
        })
    }

    save() {
        
    }

    create(params) {
        return new Promise(async (resolve, reject) => {
            try {
                const r = await db.exe('enterprise', 'createPerson', params)
                resolve(new Person(r.rows[0]))
            } catch (error) {
                log.show({ type: log.TYPE_ERROR, msg: `Error en Person.create: ${error.message}` })
                reject(error)
            }
        })
    }

    update(params) {
        return new Promise(async (resolve, reject) => {
            try {
                const r = await db.exe('enterprise', 'updatePerson', params)
                resolve(new Person(r.rows[0]))
            } catch (error) {
                log.show({ type: log.TYPE_ERROR, msg: `Error en Person.update: ${error.message}` })
                reject(error)
            }
        })
    }

    delete(params) {
        return new Promise(async (resolve, reject) => {
            try {
                await db.exe('enterprise', 'deletePerson', params)
                resolve()
            } catch (error) {
                log.show({ type: log.TYPE_ERROR, msg: `Error en Person.delete: ${error.message}` })
                reject(error)
            }
        })
    }
}