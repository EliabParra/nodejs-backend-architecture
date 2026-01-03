import express from 'express'
import path from 'path'
import { routes, pagesPath } from './routes.js'

const clientErrors = msgs[config.app.lang].errors.client

type PagesRouterArgs = {
    session?: { sessionExists?: (req: any) => boolean }
}

export function buildPagesRouter({ session }: PagesRouterArgs) {
    const router = express.Router()
    const requireAuth = (req: any, res: any, next: any) => {
        if (!session?.sessionExists?.(req)) {
            const returnTo = encodeURIComponent(req.originalUrl || '/')
            return res.redirect(302, `/?returnTo=${returnTo}`)
        }
        next()
    }

    routes.forEach((r) => {
        const handler = (req: any, res: any) => {
            try {
                const viewPath = path.join(pagesPath, 'pages', `${r.view}.html`)
                res.status(200).sendFile(viewPath)
            } catch (err: any) {
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
