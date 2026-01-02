import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

import { FacturacionErrorHandler } from './errors/FacturacionErrorHandler.js'
import { FacturacionValidate } from './FacturacionValidate.js'
import { FacturacionRepository } from './Facturacion.js'

const successMsgs = require('./facturacionSuccessMsgs.json')[config.app.lang]

/*
FacturacionBO

Reglas del framework:
- Solo métodos async del BO se registran como "métodos de negocio" (tx + permisos).
- Si necesitas helpers internos, pueden iniciar con "_" (ej. _mapRow, _normalize). En sync se ignoran y no se registran en DB.
- Mantén el BO delgado: valida en Validate y usa Repository para DB.
*/

export class FacturacionBO {
    async getInvoice(params) {
        try {
            // Patrón recomendado:
            // 1) validar + normalizar (en Validate)
            // 2) ejecutar repositorio (DB) en Repository
            // 3) retornar { code, msg, data?, alerts? } siguiendo el contrato

            // TODO: implementa validación según tu caso
            // if (!FacturacionValidate.validateX(params)) return FacturacionErrorHandler.invalidParameters(v.getAlerts())

            // TODO: implementa tu operación real (DB/servicios/etc.)
            // const result = await FacturacionRepository.someOperation(params)

            return {
                code: 200,
                msg: successMsgs.getInvoice ?? 'Facturacion getInvoice OK',
                data: params ?? null,
            }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `Error del servidor, FacturacionBO.getInvoice: ${err?.message || err}`,
            })
            return FacturacionErrorHandler.unknownError()
        }
    }

    async listInvoices(params) {
        try {
            // Patrón recomendado:
            // 1) validar + normalizar (en Validate)
            // 2) ejecutar repositorio (DB) en Repository
            // 3) retornar { code, msg, data?, alerts? } siguiendo el contrato

            // TODO: implementa validación según tu caso
            // if (!FacturacionValidate.validateX(params)) return FacturacionErrorHandler.invalidParameters(v.getAlerts())

            // TODO: implementa tu operación real (DB/servicios/etc.)
            // const result = await FacturacionRepository.someOperation(params)

            return {
                code: 200,
                msg: successMsgs.listInvoices ?? 'Facturacion listInvoices OK',
                data: params ?? null,
            }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `Error del servidor, FacturacionBO.listInvoices: ${err?.message || err}`,
            })
            return FacturacionErrorHandler.unknownError()
        }
    }

    async createInvoice(params) {
        try {
            // Patrón recomendado:
            // 1) validar + normalizar (en Validate)
            // 2) ejecutar repositorio (DB) en Repository
            // 3) retornar { code, msg, data?, alerts? } siguiendo el contrato

            // TODO: implementa validación según tu caso
            // if (!FacturacionValidate.validateX(params)) return FacturacionErrorHandler.invalidParameters(v.getAlerts())

            // TODO: implementa tu operación real (DB/servicios/etc.)
            // const result = await FacturacionRepository.someOperation(params)

            return {
                code: 200,
                msg: successMsgs.createInvoice ?? 'Facturacion createInvoice OK',
                data: params ?? null,
            }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `Error del servidor, FacturacionBO.createInvoice: ${err?.message || err}`,
            })
            return FacturacionErrorHandler.unknownError()
        }
    }

    async payInvoice(params) {
        try {
            // Patrón recomendado:
            // 1) validar + normalizar (en Validate)
            // 2) ejecutar repositorio (DB) en Repository
            // 3) retornar { code, msg, data?, alerts? } siguiendo el contrato

            // TODO: implementa validación según tu caso
            // if (!FacturacionValidate.validateX(params)) return FacturacionErrorHandler.invalidParameters(v.getAlerts())

            // TODO: implementa tu operación real (DB/servicios/etc.)
            // const result = await FacturacionRepository.someOperation(params)

            return {
                code: 200,
                msg: successMsgs.payInvoice ?? 'Facturacion payInvoice OK',
                data: params ?? null,
            }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `Error del servidor, FacturacionBO.payInvoice: ${err?.message || err}`,
            })
            return FacturacionErrorHandler.unknownError()
        }
    }

    async cancelInvoice(params) {
        try {
            // Patrón recomendado:
            // 1) validar + normalizar (en Validate)
            // 2) ejecutar repositorio (DB) en Repository
            // 3) retornar { code, msg, data?, alerts? } siguiendo el contrato

            // TODO: implementa validación según tu caso
            // if (!FacturacionValidate.validateX(params)) return FacturacionErrorHandler.invalidParameters(v.getAlerts())

            // TODO: implementa tu operación real (DB/servicios/etc.)
            // const result = await FacturacionRepository.someOperation(params)

            return {
                code: 200,
                msg: successMsgs.cancelInvoice ?? 'Facturacion cancelInvoice OK',
                data: params ?? null,
            }
        } catch (err) {
            log.show({
                type: log.TYPE_ERROR,
                msg: `Error del servidor, FacturacionBO.cancelInvoice: ${err?.message || err}`,
            })
            return FacturacionErrorHandler.unknownError()
        }
    }
}
