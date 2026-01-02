import express from 'express'
import path from 'node:path'

async function ensureSpaDistPathIfNeeded() {
    const hasPath =
        (typeof process.env.SPA_DIST_PATH === 'string' &&
            process.env.SPA_DIST_PATH.trim().length > 0) ||
        (typeof (config as any)?.app?.spaDistPath === 'string' &&
            String((config as any).app.spaDistPath).trim().length > 0)

    if (hasPath) return

    const msg =
        'SPA mode enabled but SPA_DIST_PATH is missing.\n' +
        '- Set SPA_DIST_PATH in .env (folder containing index.html), or\n' +
        '- Set config.app.spaDistPath in src/config/config.json.\n'

    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
    if (!interactive) {
        throw new Error(msg)
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
        throw new Error('SPA_DIST_PATH is required for APP_FRONTEND_MODE=spa')
    }

    process.env.SPA_DIST_PATH = entered
}

function resolveSpaDistPath() {
    const fromEnv = process.env.SPA_DIST_PATH
    if (fromEnv && String(fromEnv).trim().length > 0) return path.resolve(String(fromEnv))

    const fromConfig = (config as any)?.app?.spaDistPath
    if (fromConfig && String(fromConfig).trim().length > 0) return path.resolve(String(fromConfig))

    // Deliberately no default: keep backend decoupled from any specific frontend repo/framework.
    return null
}

export async function registerSpaHosting(app: any) {
    await ensureSpaDistPathIfNeeded()

    const distPath = resolveSpaDistPath()
    if (!distPath) {
        throw new Error(
            'SPA mode enabled but no dist path configured. Set SPA_DIST_PATH (env) or config.app.spaDistPath to a folder containing index.html.'
        )
    }

    app.use(express.static(distPath))

    // SPA fallback: any unmatched GET that accepts HTML returns index.html
    // (Express 5 uses path-to-regexp v6; '*' is not a valid string pattern)
    app.get(/.*/, (req: any, res: any, next: any) => {
        if (req.method !== 'GET') return next()

        const accept = String(req.headers?.accept ?? '')
        if (!accept.includes('text/html')) return next()

        return res.status(200).sendFile(path.join(distPath, 'index.html'), (err: any) => {
            if (err) return next(err)
        })
    })
}
