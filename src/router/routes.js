import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pagesPath = path.resolve(__dirname, '..', '..', 'public')

const routes = [
    {
        name: 'home',
        path: '/',
        view: 'index',
        validateIsAuth: false
    },
    {
        name: 'content',
        path: '/content',
        view: 'content',
        validateIsAuth: true
    }
]

routes.map(r => r.view = path.join(pagesPath, 'pages', `${r.view}.html`))

export { routes, pagesPath }