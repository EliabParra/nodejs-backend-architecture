// Minimal smoke-check for the compiled output in dist/.
// Keeps it side-effect free: only imports modules.

async function main() {
    // Importing this module should not require runtime globals yet
    // (they're only accessed when calling the exported functions).
    await import(new URL('../dist/src/BSS/helpers/http-validators.js', import.meta.url))

    // Import globals module too (should be safe to import).
    await import(new URL('../dist/src/globals.js', import.meta.url))

    console.log('dist smoke: ok')
}

main().catch((err) => {
    console.error('dist smoke: failed')
    console.error(err)
    process.exitCode = 1
})
