import { createRequire } from 'node:module'

globalThis.require = createRequire(import.meta.url)
globalThis.config = globalThis.require('./config/config.json')
globalThis.queries = globalThis.require('./config/queries.json')
globalThis.msgs = globalThis.require('./config/messages.json')
const { default: Validator } = await import('./BSS/Validator.js')
const { default: Log } = await import('./BSS/Log.js')
const { default: DBComponent } = await import('./BSS/DBComponent.js')
const { default: Security } = await import('./BSS/Security.js')
globalThis.v = new Validator()
globalThis.log = new Log()
globalThis.db = new DBComponent()
globalThis.security = new Security()