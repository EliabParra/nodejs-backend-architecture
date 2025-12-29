import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const errorMsgs = require('./orderErrorMsgs.json')[config.app.lang]

export class OrderErrorHandler {
  static notFound() { return errorMsgs.notFound }

  static invalidParameters(alerts) {
    const { code, msg } = errorMsgs.invalidParameters
    return { code, msg, alerts: alerts ?? [] }
  }

  static unauthorized() { return errorMsgs.unauthorized }

  static unknownError() { return errorMsgs.unknownError }
}
