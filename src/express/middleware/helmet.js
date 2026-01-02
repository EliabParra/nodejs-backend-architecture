import helmet from 'helmet'

export function applyHelmet(app) {
    // Kept conservative; CSP disabled to avoid breaking inline scripts in public/pages.
    app.use(helmet({ contentSecurityPolicy: false }))
}
