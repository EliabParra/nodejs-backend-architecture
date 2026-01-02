// Minimal smoke-check for the compiled output in dist/.
// Keeps it side-effect free: only imports modules.

async function main() {
    // Initialize runtime globals first.
    await import(new URL('../dist/src/globals.js', import.meta.url))

    await import(new URL('../dist/src/helpers/sanitize.js', import.meta.url))

    // These modules should be importable from dist without throwing.
    await import(new URL('../dist/src/BSS/helpers/http-validators.js', import.meta.url))
    await import(new URL('../dist/src/BSS/helpers/audit-log.js', import.meta.url))
    await import(new URL('../dist/src/BSS/helpers/http-responses.js', import.meta.url))

    await import(new URL('../dist/src/BSS/Dispatcher.js', import.meta.url))
    await import(new URL('../dist/src/BSS/Security.js', import.meta.url))

    console.log('dist smoke: ok')
}

main().catch((err) => {
    console.error('dist smoke: failed')
    console.error(err)
    process.exitCode = 1
})
