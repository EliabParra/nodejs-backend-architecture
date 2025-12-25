import { PersonId } from './PersonId.js'
import { PersonNa } from './PersonNa.js'
import { PersonLn } from './PersonLn.js'
import { PersonNotFound } from '../errors/PersonNotFound.js'

export class Person {
    constructor({ person_id, person_na, person_ln }) {
        this.person_id = typeof person_id === 'object' ? person_id : new PersonId(person_id)
        this.person_na = typeof person_na === 'object' ? person_na : new PersonNa(person_na)
        this.person_ln = typeof person_ln === 'object' ? person_ln : new PersonLn(person_ln)
    }

    fullName() { return `${this.person_na.value} ${this.person_ln.value}` }

    mapToPrimitives() {
        return {
            person_id: this.person_id.value,
            person_na: this.person_na.value,
            person_ln: this.person_ln.value
        }
    }
}