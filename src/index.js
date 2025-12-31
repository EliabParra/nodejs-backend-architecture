import './globals.js'
import Security from "./BSS/Security.js"
import Dispatcher from "./BSS/Dispatcher.js"

// Security is created only for the server runtime.
// This keeps CLI scripts (that import globals) from doing DB work on import.
globalThis.security = new Security()

const dispatcher = new Dispatcher()
await dispatcher.init()
dispatcher.serverOn()

let shuttingDown = false
async function shutdown(signal) {
	if (shuttingDown) return
	shuttingDown = true
	try {
		log.show({ type: log.TYPE_INFO, msg: `Shutting down (${signal})...` })
		await dispatcher.shutdown()
		process.exit(0)
	} catch (err) {
		try { log.show({ type: log.TYPE_ERROR, msg: `Shutdown error: ${err?.message ?? err}` }) } catch { }
		process.exit(1)
	}
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))