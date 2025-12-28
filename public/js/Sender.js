export class Sender {
    constructor(statusBar) {
        this.statusBar = statusBar
        this._server = "localhost"
        this._port = 3000
        this._endpoint = "/toProccess"
        this.url = `http://${this._server}:${this._port}${this._endpoint}`
        this._csrfToken = null
        this._default = {
            method:'post',
            headers:{ "Content-Type": "application/json" },
            mode: 'cors', 
            credentials: 'include',
            cache: 'default',
        }
    }

    #updateUrl() { this.url = `http://${this._server}:${this._port}${this._endpoint}` }

    set endpoint(value) { this._endpoint = value; this.#updateUrl() }
    get endpoint() { return this._endpoint } 

    set server(value) { this._server = value; this.#updateUrl() }
    get server() { return this._server } 

    set port(value) { this._port = value; this.#updateUrl() }
    get port() { return this._port } 

    async #ensureCsrfToken() {
        if (this._csrfToken) return this._csrfToken
        const url = `http://${this._server}:${this._port}/csrf`
        const r = await fetch(url, {
            method: 'get',
            mode: 'cors',
            credentials: 'include',
            cache: 'no-store'
        })
        const data = await r.json()
        this._csrfToken = data.csrfToken
        return this._csrfToken
    }

    async send(jd, endpoint = 'none') {
        if (endpoint === 'none') this.endpoint = '/toProccess'
        else this.endpoint = endpoint

        if (jd) for(let attr in jd) {
            if (attr === "body") { this._default[attr] = JSON.stringify(jd[attr]) }
            else this._default[attr] = jd[attr]
        }
        const csrf = await this.#ensureCsrfToken()
        this._default.headers = this._default.headers || {}
        this._default.headers['X-CSRF-Token'] = csrf

        const r = await fetch(this.url, this._default)
        const data = await r.json();
        if (data.alerts) this.statusBar.showAlerts(data.alerts)
        else this.statusBar.show(data.msg)
        this.endpoint = 'none'
        return data
    }
}