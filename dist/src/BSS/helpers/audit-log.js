import { redactSecrets } from '../../helpers/sanitize.js';
/**
 * Writes an audit event to the DB using a best-effort strategy.
 * If the insert fails, it will not affect the request flow.
 */
export async function auditBestEffort(req, args, ctx) {
    const { action, object_na = null, method_na = null, tx = null, user_id = req?.session?.user_id ?? null, profile_id = req?.session?.profile_id ?? null, details = {}, } = args ?? {};
    try {
        const effectiveDb = ctx?.db ?? db;
        const safeDetails = redactSecrets((details ?? {}));
        await effectiveDb.exe('security', 'insertAuditLog', [
            req?.requestId,
            user_id,
            profile_id,
            action,
            object_na,
            method_na,
            tx,
            JSON.stringify(safeDetails),
        ]);
    }
    catch { }
}
