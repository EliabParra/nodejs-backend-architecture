export function createReadyHandler({ clientErrors }) {
    return async function ready(req, res) {
        // Readiness: Security loaded + DB reachable.
        if (!security?.isReady) {
            return res
                .status(clientErrors.serviceUnavailable.code)
                .send(clientErrors.serviceUnavailable);
        }
        try {
            // Minimal DB check.
            await db.pool.query('SELECT 1');
            return res.status(200).send({ ok: true });
        }
        catch {
            return res
                .status(clientErrors.serviceUnavailable.code)
                .send(clientErrors.serviceUnavailable);
        }
    };
}
