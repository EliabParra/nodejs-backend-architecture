export async function withGlobalLock(fn) {
    const prev = globalThis.__globalTestLock ?? Promise.resolve()
    let release
    const next = new Promise((resolve) => {
        release = resolve
    })
    globalThis.__globalTestLock = prev.then(() => next)
    await prev
    try {
        return await fn()
    } finally {
        release()
    }
}

export function snapshotGlobals(keys) {
    const snap = {}
    for (const k of keys) snap[k] = globalThis[k]
    return snap
}

export function restoreGlobals(snapshot) {
    for (const [k, v] of Object.entries(snapshot)) {
        if (v === undefined) delete globalThis[k]
        else globalThis[k] = v
    }
}

export async function withGlobals(keys, fn) {
    return await withGlobalLock(async () => {
        const snap = snapshotGlobals(keys)
        try {
            return await fn()
        } finally {
            restoreGlobals(snap)
        }
    })
}
