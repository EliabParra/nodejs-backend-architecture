import { randomUUID } from 'node:crypto'

export function applyRequestId(app: any) {
    app.use((req: AppRequest, res: AppResponse, next: any) => {
        const requestId = randomUUID()
        req.requestId = requestId
        req.requestStartMs = Date.now()
        ;(res as any).setHeader('X-Request-Id', requestId)
        next()
    })
}
