export class PersonId {
    constructor(value) {
        this.value = value
        this.#ensureIsValid()
    }

    #ensureIsValid() {
        if (!v.validateInt(this.value)) return { msg: 'Valor inválido', alerts: v.getAlerts() }
    }
}