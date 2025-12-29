import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

import { OrderErrorHandler } from './errors/OrderErrorHandler.js'
import { OrderValidate } from './OrderValidate.js'
import { OrderRepository } from './Order.js'

const successMsgs = require('./orderSuccessMsgs.json')[config.app.lang]

export class OrderBO {
  async getOrder(params) {
    try {
      return { code: 200, msg: successMsgs.getOrder ?? 'Order getOrder OK', data: params ?? null }
    } catch (err) {
      log.show({ type: log.TYPE_ERROR, msg: `Error del servidor, OrderBO.getOrder: ${err?.message || err}` })
      return OrderErrorHandler.unknownError()
    }
  }

  async createOrder(params) {
    try {
      return { code: 200, msg: successMsgs.createOrder ?? 'Order createOrder OK', data: params ?? null }
    } catch (err) {
      log.show({ type: log.TYPE_ERROR, msg: `Error del servidor, OrderBO.createOrder: ${err?.message || err}` })
      return OrderErrorHandler.unknownError()
    }
  }

  async shipOrder(params) {
    try {
      return { code: 200, msg: successMsgs.shipOrder ?? 'Order shipOrder OK', data: params ?? null }
    } catch (err) {
      log.show({ type: log.TYPE_ERROR, msg: `Error del servidor, OrderBO.shipOrder: ${err?.message || err}` })
      return OrderErrorHandler.unknownError()
    }
  }

  async cancelOrder(params) {
    try {
      return { code: 200, msg: successMsgs.cancelOrder ?? 'Order cancelOrder OK', data: params ?? null }
    } catch (err) {
      log.show({ type: log.TYPE_ERROR, msg: `Error del servidor, OrderBO.cancelOrder: ${err?.message || err}` })
      return OrderErrorHandler.unknownError()
    }
  }
}
