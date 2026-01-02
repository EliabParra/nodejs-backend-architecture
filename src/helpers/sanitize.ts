const SENSITIVE_KEY_RE =
    /^(?:pass|password|newPassword|token|code|secret|csrfToken|authorization|cookie|set-cookie|otp|oneTimeCode)$/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value == null || typeof value !== 'object') return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

type RedactOptions = {
    maxDepth?: number
    maxStringLength?: number
}

export function redactSecrets(value: unknown, { maxDepth = 6, maxStringLength = 2000 }: RedactOptions = {}) {
    function walk(v: unknown, depth: number): unknown {
        if (depth > maxDepth) return '[Truncated]'
        if (v == null) return v

        if (typeof v === 'string') {
            return v.length > maxStringLength ? `${v.slice(0, maxStringLength)}…` : v
        }

        if (typeof v !== 'object') return v

        if (Array.isArray(v)) {
            return v.map((item) => walk(item, depth + 1))
        }

        if (!isPlainObject(v)) {
            // Avoid serializing complex instances (Error, Date, etc.).
            try {
                const s = String(v)
                return s.length > maxStringLength ? `${s.slice(0, maxStringLength)}…` : s
            } catch {
                return '[Unserializable]'
            }
        }

        const out: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(v)) {
            if (SENSITIVE_KEY_RE.test(k)) {
                out[k] = '[REDACTED]'
                continue
            }
            out[k] = walk(val, depth + 1)
        }
        return out
    }

    return walk(value, 0)
}

export function redactSecretsInString(message: unknown) {
    const s = typeof message === 'string' ? message : String(message ?? '')

    // Redact common "key=value" or "key: value" shapes.
    return s.replace(
        /\b(token|code|password|newPassword|csrfToken)\b\s*[:=]\s*([^\s,;]+)/gi,
        (_, key: string) => `${key}=[REDACTED]`
    )
}
