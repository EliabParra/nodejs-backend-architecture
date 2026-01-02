/*
Auth Repository

- Isola acceso a DB para el BO.
*/

export class AuthRepository {
    static _isSafeIdent(value) {
        return typeof value === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
    }

    static _quoteIdent(ident) {
        if (!AuthRepository._isSafeIdent(ident)) {
            throw new Error(`Unsafe SQL identifier: ${String(ident)}`)
        }
        return `"${ident}"`
    }

    static async getUserByEmail(email) {
        const r = await db.exe('security', 'getUserByEmail', [email])
        return r?.rows?.[0] ?? null
    }

    static async getUserBaseByEmail(email) {
        const r = await db.exe('security', 'getUserBaseByEmail', [email])
        return r?.rows?.[0] ?? null
    }

    static async getUserByUsername(username) {
        const r = await db.exe('security', 'getUserByUsername', [username])
        return r?.rows?.[0] ?? null
    }

    static async getUserBaseByUsername(username) {
        const r = await db.exe('security', 'getUserBaseByUsername', [username])
        return r?.rows?.[0] ?? null
    }

    static async insertUser({ username, email, passwordHash }) {
        const r = await db.exe('security', 'insertUser', [username, email, passwordHash])
        return r?.rows?.[0] ?? null
    }

    static async upsertUserProfile({ userId, profileId }) {
        await db.exe('security', 'upsertUserProfile', [userId, profileId])
        return true
    }

    static async setUserEmailVerified(userId) {
        await db.exe('security', 'setUserEmailVerified', [userId])
        return true
    }

    static async insertPasswordReset({ userId, tokenHash, sentTo, expiresSeconds, ip, userAgent }) {
        return await db.exe('security', 'insertPasswordReset', [
            userId,
            tokenHash,
            sentTo,
            String(expiresSeconds),
            ip ?? null,
            userAgent ?? null,
        ])
    }

    static async invalidateActivePasswordResetsForUser(userId) {
        await db.exe('security', 'invalidateActivePasswordResetsForUser', [userId])
        return true
    }

    static async getPasswordResetByTokenHash(tokenHash) {
        const r = await db.exe('security', 'getPasswordResetByTokenHash', [tokenHash])
        return r?.rows?.[0] ?? null
    }

    static async incrementPasswordResetAttempt(resetId) {
        await db.exe('security', 'incrementPasswordResetAttempt', [resetId])
        return true
    }

    static async markPasswordResetUsed(resetId) {
        await db.exe('security', 'markPasswordResetUsed', [resetId])
        return true
    }

    static async insertOneTimeCode({ userId, purpose, codeHash, expiresSeconds, meta }) {
        await db.exe('security', 'insertOneTimeCode', [
            userId,
            purpose,
            codeHash,
            String(expiresSeconds),
            JSON.stringify(meta ?? {}),
        ])
        return true
    }

    static async consumeOneTimeCodesForUserPurpose({ userId, purpose }) {
        await db.exe('security', 'consumeOneTimeCodesForUserPurpose', [userId, purpose])
        return true
    }

    static async getValidOneTimeCode({ userId, purpose, codeHash }) {
        const r = await db.exe('security', 'getValidOneTimeCodeForPurpose', [
            userId,
            purpose,
            codeHash,
        ])
        return r?.rows?.[0] ?? null
    }

    static async getValidOneTimeCodeByTokenHash({ purpose, tokenHash, codeHash }) {
        const r = await db.exe('security', 'getValidOneTimeCodeForPurposeAndTokenHash', [
            purpose,
            tokenHash,
            codeHash,
        ])
        return r?.rows?.[0] ?? null
    }

    static async getActiveOneTimeCodeByTokenHash({ purpose, tokenHash }) {
        const r = await db.exe('security', 'getActiveOneTimeCodeForPurposeAndTokenHash', [
            purpose,
            tokenHash,
        ])
        return r?.rows?.[0] ?? null
    }

    static async incrementOneTimeCodeAttempt(codeId) {
        await db.exe('security', 'incrementOneTimeCodeAttempt', [codeId])
        return true
    }

    static async consumeOneTimeCode(codeId) {
        await db.exe('security', 'consumeOneTimeCode', [codeId])
        return true
    }

    static async updateUserPassword({ userId, passwordHash }) {
        await db.exe('security', 'updateUserPassword', [userId, passwordHash])
        return true
    }

    // Best-effort: invalidate all sessions after password reset.
    // Supports only pg-backed sessions (connect-pg-simple).
    static async deleteSessionsByUserId(userId) {
        const store = config?.session?.store
        if (!store || store.type !== 'pg') return false

        const schemaName = store.schemaName || 'public'
        const tableName = store.tableName || 'session'

        const qSchema = AuthRepository._quoteIdent(String(schemaName))
        const qTable = AuthRepository._quoteIdent(String(tableName))

        const sql = `delete from ${qSchema}.${qTable} where (sess->>'user_id') = $1`

        if (typeof db?.exeRaw !== 'function') {
            throw new Error('db.exeRaw is not available')
        }

        await db.exeRaw(sql, [String(userId)])
        return true
    }
}
