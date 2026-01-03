export function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message

    if (err && typeof err === 'object' && 'message' in err) {
        const message = (err as { message?: unknown }).message
        if (message != null) return String(message)
    }

    return String(err)
}
