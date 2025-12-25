export class PersonNa {
    constructor(value) {
        this.value = value
        this.#ensureIsValid()
    }

    #ensureIsValid() {
        if (!v.validateString(this.value)) return { msg: 'Valor inválido', alerts: v.getAlerts() }
    }
}