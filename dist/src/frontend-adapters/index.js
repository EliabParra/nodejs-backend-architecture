function getFrontendMode() {
    const raw = String(config?.app?.frontendMode ?? 'pages')
        .trim()
        .toLowerCase();
    if (raw === 'pages' || raw === 'spa' || raw === 'none')
        return raw;
    return 'pages';
}
/**
 * Registers optional frontend hosting adapters.
 *
 * IMPORTANT: ordering matters.
 * - pages mode should be registered in the "preApi" stage (so it can own / routes)
 * - spa mode should be registered in the "postApi" stage (so API routes are not shadowed by SPA fallback)
 */
export async function registerFrontendHosting(app, { session, stage }) {
    const mode = getFrontendMode();
    if (mode === 'none')
        return;
    if (stage === 'preApi' && mode === 'pages') {
        const { registerPagesHosting } = await import('./pages.adapter.js');
        await registerPagesHosting(app, { session });
        return;
    }
    if (stage === 'postApi' && mode === 'spa') {
        const { registerSpaHosting } = await import('./spa.adapter.js');
        await registerSpaHosting(app);
    }
}
