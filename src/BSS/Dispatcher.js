import Session from "./Session.js"
import express from "express"
import { buildPagesRouter, pagesPath } from "../router/pages.js"

export default class Dispatcher {
    constructor() {
        this.app = express()
        this.app.use(express.json())
        this.app.use(express.urlencoded({ extended: false }))
        this.app.use(express.static(pagesPath))
        this.session = new Session(this.app)
        this.init()
    }

    init() {
        this.app.use(buildPagesRouter({ session: this.session }))
        this.app.post("/toProccess", this.toProccess.bind(this))
        this.app.post("/login", this.login.bind(this))
        this.app.post("/logout", this.logout.bind(this))        
    }

    async toProccess(req, res) {
        try {
            if (!this.session.sessionExists(req)) return res.status(401).send({ msg: "debes iniciar sesion" })
            const txData = security.getDataTx(req.body.tx)

            if (!txData) return res.status(401).send({ msg: "no existe la transacción"})
            const jsonData = {
                profile_id: req.session.profile_id,
                method_na: txData.method_na,
                object_na: txData.object_na,
                params: req.body.params
            }

            if (!security.getPermissions(jsonData)) return res.status(401).send({ msg: "no tiene permisos"})
            res.send(await security.executeMethod(jsonData))
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `Exception in /toProccess: ${err.message}` })
            res.status(500).send({ msg: 'error de servidor' })
        }
    }

    login(req, res) {
        try {
            this.session.createSession(req, res)
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `Exception in /login: ${err.message}` })
            res.status(500).send({ msg: 'error de servidor' })
        }
    }

    logout(req, res) {
        try {
            if (this.session.sessionExists(req)) {
                this.session.destroySession(req) 
                return res.status(200).send({ msg: "sesion destruida" })
            } else return res.status(401).send({ msg: "sesion no existe" })
        } catch (err) {
            log.show({ type: log.TYPE_ERROR, msg: `Exception in /logout: ${err.message}` })
            res.status(500).send({ msg: 'error de servidor' })
        }
    }

    serverOn() {
        this.app.listen(config.app.port, () => log.show({ type: log.TYPE_INFO, msg: `Servidor corriendo en http://${config.app.host}:${config.app.port}` }))
    }
}