/*
Auth Repository

- Isola acceso a DB para el BO.
*/

type UserBaseRow = {
    user_id: number
    user_em?: string | null
    email_verified_at?: string | Date | null
}

type UserRow = {
    user_id: number
    user_em?: string | null
}

type PasswordResetRow = {
    reset_id: number
    user_id: number
    expires_at?: string | Date | null
    used_at?: string | Date | null
    attempt_count?: number | null
}

type OneTimeCodeRow = {
    code_id: number
    user_id: number
    attempt_count?: number | null
    meta?: string | Record<string, unknown> | null
}

export class AuthRepository {
    static _isSafeIdent(value: string): boolean {
        return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
    }

    static _quoteIdent(ident: string): string {
        if (!AuthRepository._isSafeIdent(ident)) {
            throw new Error(`Unsafe SQL identifier: ${ident}`)
        }
        return `"${ident}"`
    }

    static async getUserByEmail(email: string): Promise<UserRow | null> {
        const r = (await db.exe('security', 'getUserByEmail', [email])) as { rows?: UserRow[] }
        return r.rows?.[0] ?? null
    }

    static async getUserBaseByEmail(email: string): Promise<UserBaseRow | null> {
        const r = (await db.exe('security', 'getUserBaseByEmail', [email])) as {
            rows?: UserBaseRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async getUserByUsername(username: string): Promise<UserRow | null> {
        const r = (await db.exe('security', 'getUserByUsername', [username])) as {
            rows?: UserRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async getUserBaseByUsername(username: string): Promise<UserBaseRow | null> {
        const r = (await db.exe('security', 'getUserBaseByUsername', [username])) as {
            rows?: UserBaseRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async insertUser({
        username,
        email,
        passwordHash,
    }: {
        username: string
        email: string
        passwordHash: string
    }): Promise<{ user_id: number } | null> {
        const r = (await db.exe('security', 'insertUser', [username, email, passwordHash])) as {
            rows?: Array<{ user_id: number }>
        }
        return r.rows?.[0] ?? null
    }

    static async upsertUserProfile({ userId, profileId }: { userId: number; profileId: number }) {
        await db.exe('security', 'upsertUserProfile', [userId, profileId])
        return true
    }

    static async setUserEmailVerified(userId: number) {
        await db.exe('security', 'setUserEmailVerified', [userId])
        return true
    }

    static async insertPasswordReset({
        userId,
        tokenHash,
        sentTo,
        expiresSeconds,
        ip,
        userAgent,
    }: {
        userId: number
        tokenHash: string
        sentTo: string
        expiresSeconds: number
        ip?: string | null
        userAgent?: string | null
    }): Promise<void> {
        await db.exe('security', 'insertPasswordReset', [
            userId,
            tokenHash,
            sentTo,
            String(expiresSeconds),
            ip ?? null,
            userAgent ?? null,
        ])
    }

    static async invalidateActivePasswordResetsForUser(userId: number) {
        await db.exe('security', 'invalidateActivePasswordResetsForUser', [userId])
        return true
    }

    static async getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRow | null> {
        const r = (await db.exe('security', 'getPasswordResetByTokenHash', [tokenHash])) as {
            rows?: PasswordResetRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async incrementPasswordResetAttempt(resetId: number) {
        await db.exe('security', 'incrementPasswordResetAttempt', [resetId])
        return true
    }

    static async markPasswordResetUsed(resetId: number) {
        await db.exe('security', 'markPasswordResetUsed', [resetId])
        return true
    }

    static async insertOneTimeCode({
        userId,
        purpose,
        codeHash,
        expiresSeconds,
        meta,
    }: {
        userId: number
        purpose: string
        codeHash: string
        expiresSeconds: number
        meta?: Record<string, unknown>
    }) {
        await db.exe('security', 'insertOneTimeCode', [
            userId,
            purpose,
            codeHash,
            String(expiresSeconds),
            JSON.stringify(meta ?? {}),
        ])
        return true
    }

    static async consumeOneTimeCodesForUserPurpose({
        userId,
        purpose,
    }: {
        userId: number
        purpose: string
    }) {
        await db.exe('security', 'consumeOneTimeCodesForUserPurpose', [userId, purpose])
        return true
    }

    static async getValidOneTimeCode({
        userId,
        purpose,
        codeHash,
    }: {
        userId: number
        purpose: string
        codeHash: string
    }): Promise<OneTimeCodeRow | null> {
        const r = (await db.exe('security', 'getValidOneTimeCodeForPurpose', [
            userId,
            purpose,
            codeHash,
        ])) as { rows?: OneTimeCodeRow[] }
        return r.rows?.[0] ?? null
    }

    static async getValidOneTimeCodeByTokenHash({
        purpose,
        tokenHash,
        codeHash,
    }: {
        purpose: string
        tokenHash: string
        codeHash: string
    }): Promise<OneTimeCodeRow | null> {
        const r = (await db.exe('security', 'getValidOneTimeCodeForPurposeAndTokenHash', [
            purpose,
            tokenHash,
            codeHash,
        ])) as { rows?: OneTimeCodeRow[] }
        return r.rows?.[0] ?? null
    }

    static async getActiveOneTimeCodeByTokenHash({
        purpose,
        tokenHash,
    }: {
        purpose: string
        tokenHash: string
    }): Promise<OneTimeCodeRow | null> {
        const r = (await db.exe('security', 'getActiveOneTimeCodeForPurposeAndTokenHash', [
            purpose,
            tokenHash,
        ])) as { rows?: OneTimeCodeRow[] }
        return r.rows?.[0] ?? null
    }

    static async incrementOneTimeCodeAttempt(codeId: number) {
        await db.exe('security', 'incrementOneTimeCodeAttempt', [codeId])
        return true
    }

    static async consumeOneTimeCode(codeId: number) {
        await db.exe('security', 'consumeOneTimeCode', [codeId])
        return true
    }

    static async updateUserPassword({
        userId,
        passwordHash,
    }: {
        userId: number
        passwordHash: string
    }) {
        await db.exe('security', 'updateUserPassword', [userId, passwordHash])
        return true
    }

    // Best-effort: invalidate all sessions after password reset.
    // Supports only pg-backed sessions (connect-pg-simple).
    static async deleteSessionsByUserId(userId: number) {
        const store = config?.session?.store as
            | { type?: string; schemaName?: string; tableName?: string }
            | undefined
        if (!store || store.type !== 'pg') return false

        const schemaName = store.schemaName || 'public'
        const tableName = store.tableName || 'session'

        const qSchema = AuthRepository._quoteIdent(String(schemaName))
        const qTable = AuthRepository._quoteIdent(String(tableName))

        const sql = `delete from ${qSchema}.${qTable} where (sess->>'user_id') = $1`

        const maybeDb = db as { exeRaw?: (sql: string, params: string[]) => Promise<unknown> }
        if (typeof maybeDb.exeRaw !== 'function') throw new Error('db.exeRaw is not available')

        await maybeDb.exeRaw(sql, [String(userId)])
        return true
    }
}
