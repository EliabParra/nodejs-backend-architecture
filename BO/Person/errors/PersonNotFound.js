export class PersonNotFound extends Error {
    constructor(message) {
        super(message)
        this.name = 'PersonNotFound'
    }
}