import express from 'express'
import path from 'path'
import { routes, pagesPath } from './routes.js'
const clientErrors = msgs[config.app.lang].errors.client

routes.map(r => r.view = path.join(pagesPath, 'pages', `${r.view}.html`))

export function buildPagesRouter({ session }) {
    const router = express.Router()
    const requireAuth = (req, res, next) => {
        if (!session?.sessionExists(req)) {
            const returnTo = encodeURIComponent(req.originalUrl || '/')
            return res.redirect(`/?returnTo=${returnTo}`).status(clientErrors.accessDenied.code).send(clientErrors.accessDenied)
        }
        next()
    }

    routes.forEach(r => {
        const handler = (req, res) => {
            try {
                res.status(200).sendFile(r.view)
            } catch (err) {
                log.show({ type: log.TYPE_ERROR, msg: `Exception in ${r.path}: ${err.message}` })
                res.status(clientErrors.unknown.code).send(clientErrors.unknown)
            }
        }
        if (r.validateIsAuth) router.get(r.path, requireAuth, handler)
        else router.get(r.path, handler)
    })

    return router
}

export { pagesPath }