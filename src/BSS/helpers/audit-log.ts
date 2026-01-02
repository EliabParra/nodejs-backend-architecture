import { redactSecrets } from '../../helpers/sanitize.js'

type AuditArgs = {
    action: string
    object_na?: string | null
    method_na?: string | null
    tx?: unknown
    user_id?: number | null
    profile_id?: number | null
    details?: Record<string, unknown>
}

type CtxLike = {
    db?: any
} | null

/**
 * Writes an audit event to the DB using a best-effort strategy.
 * If the insert fails, it will not affect the request flow.
 */
export async function auditBestEffort(
    req: AppRequest,
    args: AuditArgs,
    ctx?: CtxLike
): Promise<void> {
    const {
        action,
        object_na = null,
        method_na = null,
        tx = null,
        user_id = req?.session?.user_id ?? null,
        profile_id = req?.session?.profile_id ?? null,
        details = {},
    } = args ?? ({} as AuditArgs)

    try {
        const effectiveDb = (ctx as unknown as { db?: any } | null)?.db ?? db
        const safeDetails = redactSecrets((details ?? {}) as Record<string, unknown>)

        await effectiveDb.exe('security', 'insertAuditLog', [
            req?.requestId,
            user_id,
            profile_id,
            action,
            object_na,
            method_na,
            tx,
            JSON.stringify(safeDetails),
        ])
    } catch {}
}
