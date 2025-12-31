import { randomUUID } from 'node:crypto'

export function applyRequestId(app) {
  app.use((req, res, next) => {
    const requestId = randomUUID()
    req.requestId = requestId
    req.requestStartMs = Date.now()
    res.setHeader('X-Request-Id', requestId)
    next()
  })
}
