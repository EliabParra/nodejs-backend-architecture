/*
Auth Repository

- DB access helpers used by AuthBO.
- Must align with query names in src/config/queries.json.
*/

export type UserRow = {
    user_id: number
    user_na?: string | null
    user_em?: string | null
    email_verified_at?: string | Date | null
    user_pw?: string | null
    profile_id?: number | null
}

export type UserBaseRow = {
    user_id: number
    user_na?: string | null
    user_em?: string | null
    email_verified_at?: string | Date | null
}

export type PasswordResetRow = {
    reset_id: number
    user_id: number
    expires_at?: string | Date | null
    used_at?: string | Date | null
    attempt_count?: number | null
}

export type OneTimeCodeRow = {
    code_id: number
    user_id: number
    purpose?: string | null
    expires_at?: string | Date | null
    consumed_at?: string | Date | null
    attempt_count?: number | null
    meta?: any
}

export class AuthRepository {
    // --- Users
    static async getUserByEmail(email: string): Promise<UserRow | null> {
        const r = (await db.exe('security', 'getUserByEmail', [email])) as { rows?: UserRow[] }
        return r.rows?.[0] ?? null
    }

    static async getUserByUsername(username: string): Promise<UserRow | null> {
        const r = (await db.exe('security', 'getUserByUsername', [username])) as {
            rows?: UserRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async getUserBaseByEmail(email: string): Promise<UserBaseRow | null> {
        const r = (await db.exe('security', 'getUserBaseByEmail', [email])) as {
            rows?: UserBaseRow[]
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
        username: string | null
        email: string | null
        passwordHash: string
    }): Promise<{ user_id: number }> {
        const r = (await db.exe('security', 'insertUser', [username, email, passwordHash])) as {
            rows?: Array<{ user_id: number }>
        }
        const row = r.rows?.[0]
        if (!row?.user_id) throw new Error('insertUser did not return user_id')
        return row
    }

    static async upsertUserProfile({ userId, profileId }: { userId: number; profileId: number }) {
        await db.exe('security', 'upsertUserProfile', [userId, profileId])
        return true
    }

    static async setUserEmailVerified(userId: number) {
        await db.exe('security', 'setUserEmailVerified', [userId])
        return true
    }

    static async updateUserLastLogin(userId: number) {
        await db.exe('security', 'updateUserLastLogin', [userId])
        return true
    }

    // --- Password reset
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

    static async invalidateActivePasswordResetsForUser(userId: number): Promise<boolean> {
        await db.exe('security', 'invalidateActivePasswordResetsForUser', [userId])
        return true
    }

    static async getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRow | null> {
        const r = (await db.exe('security', 'getPasswordResetByTokenHash', [tokenHash])) as {
            rows?: PasswordResetRow[]
        }
        return r.rows?.[0] ?? null
    }

    static async incrementPasswordResetAttempt(resetId: number): Promise<boolean> {
        await db.exe('security', 'incrementPasswordResetAttempt', [resetId])
        return true
    }

    static async markPasswordResetUsed(resetId: number): Promise<boolean> {
        await db.exe('security', 'markPasswordResetUsed', [resetId])
        return true
    }

    // --- One-time codes (email verification, password reset, etc)
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
    }): Promise<boolean> {
        await db.exe('security', 'insertOneTimeCode', [
            userId,
            purpose,
            codeHash,
            String(expiresSeconds),
            JSON.stringify(meta ?? {}),
        ])
        return true
    }

    static async consumeOneTimeCodesForUserPurpose({ userId, purpose }: { userId: number; purpose: string }) {
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

    static async getValidOneTimeCodeForPurposeAndTokenHash({
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

    static async getActiveOneTimeCodeForPurposeAndTokenHash({
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

    static async incrementOneTimeCodeAttempt(codeId: number): Promise<boolean> {
        await db.exe('security', 'incrementOneTimeCodeAttempt', [codeId])
        return true
    }

    static async consumeOneTimeCode(codeId: number): Promise<boolean> {
        await db.exe('security', 'consumeOneTimeCode', [codeId])
        return true
    }

    // --- Password
    static async updateUserPassword({ userId, passwordHash }: { userId: number; passwordHash: string }): Promise<boolean> {
        await db.exe('security', 'updateUserPassword', [userId, passwordHash])
        return true
    }
}
