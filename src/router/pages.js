import express from 'express'
import path from 'path'
import { routes, pagesPath } from './routes.js'
const clientErrors = msgs[config.app.lang].errors.client

export function buildPagesRouter({ session }) {
    const router = express.Router()
    const requireAuth = (req, res, next) => {
        if (!session?.sessionExists(req)) {
            const returnTo = encodeURIComponent(req.originalUrl || '/')
            return res.redirect(302, `/?returnTo=${returnTo}`)
        }
        next()
    }

    routes.forEach(r => {
        const handler = (req, res) => {
            try {
                const viewPath = path.join(pagesPath, 'pages', `${r.view}.html`)
                res.status(200).sendFile(viewPath)
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