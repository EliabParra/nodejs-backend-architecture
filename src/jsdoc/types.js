/**
 * Shared JSDoc typedefs for the project.
 *
 * This file exists to improve JSDoc output without migrating to TypeScript.
 * Prefer importing these typedefs in docblocks:
 *
 * - `@typedef {import('./jsdoc/types.js').ApiError} ApiError`
 * - `@typedef {import('./jsdoc/types.js').AppRequest} AppRequest`
 */

/**
 * A standardized API error response.
 * @typedef {Object} ApiError
 * @property {number} code - HTTP status code.
 * @property {string} msg - Human-friendly message.
 * @property {string[]} [alerts] - Optional validation alerts.
 */

/**
 * A standardized API success response.
 * @typedef {Object} ApiSuccess
 * @property {number} code - HTTP status code.
 * @property {string} msg - Human-friendly message.
 * @property {any} [data] - Optional payload.
 * @property {string[]} [alerts] - Optional validation alerts.
 */

/**
 * Map of error objects by key.
 * @typedef {Object.<string, ApiError>} ErrorMap
 */

/**
 * Session data used by this architecture.
 * @typedef {Object} AppSession
 * @property {number} [user_id]
 * @property {string} [user_na]
 * @property {number} [profile_id]
 * @property {string} [csrfToken]
 */

/**
 * Express Request (documented fields used by this architecture).
 *
 * Note: JSDoc's type parser is intentionally limited; we document the fields
 * we rely on rather than trying to fully represent Express types.
 *
 * @typedef {Object} AppRequest
 * @property {string} [requestId]
 * @property {number} [requestStartMs]
 * @property {AppSession} [session]
 * @property {string} [method]
 * @property {string} [originalUrl]
 * @property {Object.<string, any>} [body]
 */

/**
 * Express Response (documented fields used by this architecture).
 * @typedef {Object} AppResponse
 * @property {function(number): AppResponse} status
 * @property {function(any): AppResponse} send
 * @property {Object} [locals]
 * @property {boolean} [locals.__errorLogged]
 */

/**
 * Login request body.
 * @typedef {Object} LoginBody
 * @property {string} username
 * @property {string} password
 */

/**
 * Logout request body (demo frontend may send an object, but body is optional).
 * @typedef {Object} LogoutBody
 * @property {any} [msg]
 */

/**
 * /toProccess request body.
 * @typedef {Object} ToProccessBody
 * @property {number} tx
 * @property {any} [params]
 */

export {}
