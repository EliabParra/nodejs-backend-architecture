import './globals.js'
import './router/routes.js'
import Dispatcher from "./BSS/Dispatcher.js"

async function ensureSpaDistPathIfNeeded() {
	const mode = String(config?.app?.frontendMode ?? 'none').trim().toLowerCase()
	if (mode !== 'spa') return

	const hasPath =
		(typeof process.env.SPA_DIST_PATH === 'string' && process.env.SPA_DIST_PATH.trim().length > 0) ||
		(typeof config?.app?.spaDistPath === 'string' && config.app.spaDistPath.trim().length > 0)

	if (hasPath) return

	const msg =
		'SPA mode enabled but SPA_DIST_PATH is missing.\n' +
		'- Set SPA_DIST_PATH in .env (folder containing index.html), or\n' +
		'- Set config.app.spaDistPath in src/config/config.json.\n'

	const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
	if (!interactive) {
		console.error(msg)
		process.exit(1)
	}

	// Interactive prompt (dev convenience). Keeps backend decoupled: developer provides the path.
	const { createInterface } = await import('node:readline')
	const rl = createInterface({ input: process.stdin, output: process.stdout })
	const answer = await new Promise((resolve) => {
		rl.question('Enter SPA_DIST_PATH (folder containing index.html): ', (val) => resolve(val))
	})
	rl.close()

	const entered = String(answer ?? '').trim()
	if (!entered) {
		console.error('SPA_DIST_PATH is required for APP_FRONTEND_MODE=spa')
		process.exit(1)
	}

	process.env.SPA_DIST_PATH = entered
}

await ensureSpaDistPathIfNeeded()

const dispatcher = new Dispatcher()
dispatcher.serverOn()