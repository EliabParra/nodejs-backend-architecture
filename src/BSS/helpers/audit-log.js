/**
 * Writes an audit event to the DB using a best-effort strategy.
 * If the insert fails, it will not affect the request flow.
 *
 * @param {AppRequest} req
 * @param {Object} args
 * @param {string} args.action
 * @param {string|null} [args.object_na]
 * @param {string|null} [args.method_na]
 * @param {number|null} [args.tx]
 * @param {number|null} [args.user_id]
 * @param {number|null} [args.profile_id]
 * @param {Object} [args.details]
 * @returns {Promise<void>}
 */
export async function auditBestEffort(
    req,
    {
        action,
        object_na = null,
        method_na = null,
        tx = null,
        user_id = req?.session?.user_id ?? null,
        profile_id = req?.session?.profile_id ?? null,
        details = {}
    }
) {
    try {
        await db.exe('security', 'insertAuditLog', [
            req?.requestId,
            user_id,
            profile_id,
            action,
            object_na,
            method_na,
            tx,
            JSON.stringify(details ?? {})
        ])
    } catch { }
}
