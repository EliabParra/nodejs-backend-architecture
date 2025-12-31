import express from 'express'

export async function registerPagesHosting(app, { session }) {
	const { buildPagesRouter, pagesPath } = await import('../router/pages.js')
	app.use(express.static(pagesPath))
	app.use(buildPagesRouter({ session }))
}
