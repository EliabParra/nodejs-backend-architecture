import express from 'express'
import { routes, pagesPath } from './routes.js'

export function buildPagesRouter({ session }) {
    const router = express.Router()
    const requireAuth = (req, res, next) => {
        if (!session?.sessionExists(req)) {
            const returnTo = encodeURIComponent(req.originalUrl || '/')
            return res.redirect(`/?returnTo=${returnTo}`)
        }
        next()
    }

    routes.forEach(r => {
        const handler = (req, res) => {
            try {
                res.status(200).sendFile(r.view)
            } catch (err) {
                log.show({ type: log.TYPE_ERROR, msg: `Exception in pages router: ${err.message}` })
                res.status(500).send({ msg: 'error de servidor' })
            }
        }
        if (r.validateIsAuth) router.get(r.path, requireAuth, handler)
        else router.get(r.path, handler)
    })

    return router
}

export { pagesPath }