export function errorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (err && typeof err === 'object' && 'message' in err) {
        const message = err.message;
        if (message != null)
            return String(message);
    }
    return String(err);
}
