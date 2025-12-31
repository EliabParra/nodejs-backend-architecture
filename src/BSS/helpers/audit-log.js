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
