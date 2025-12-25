import './router/routes.js'
import Dispatcher from "./BSS/Dispatcher.js"
import { createRequire } from 'node:module'

global.require = createRequire(import.meta.url)
global.config = require('./config/config.json')
global.queries = require('./config/queries.json')
global.msgs = require('./config/messages.json')
global.v = new (require('./BSS/Validator.js').default)()
global.log = new (require('./BSS/Log.js').default)()
global.db = new (require('./BSS/DBComponent.js').default)()
global.security = new (require('./BSS/Security.js').default)()

const dispatcher = new Dispatcher()
dispatcher.serverOn()