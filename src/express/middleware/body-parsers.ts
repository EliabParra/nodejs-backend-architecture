import express from 'express'

export function applyBodyParsers(app: any) {
    const bodyLimit = (config as any)?.app?.bodyLimit ?? '100kb'
    app.use(express.json({ limit: bodyLimit }))
    app.use(express.urlencoded({ extended: false, limit: bodyLimit }))
}
