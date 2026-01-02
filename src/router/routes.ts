import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const pagesPath = path.resolve(__dirname, '..', '..', 'public')

export const routes = [
    {
        name: 'home',
        path: '/',
        view: 'index',
        validateIsAuth: false,
    },
]
