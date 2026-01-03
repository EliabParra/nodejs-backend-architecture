type ReadyHandlerArgs = {
    clientErrors: any
}

export function createReadyHandler({ clientErrors }: ReadyHandlerArgs) {
    return async function ready(req: AppRequest, res: AppResponse) {
        // Readiness: Security loaded + DB reachable.
        if (!(security as any)?.isReady) {
            return res
                .status(clientErrors.serviceUnavailable.code)
                .send(clientErrors.serviceUnavailable)
        }

        try {
            // Minimal DB check.
            await (db as any).pool.query('SELECT 1')
            return res.status(200).send({ ok: true })
        } catch {
            return res
                .status(clientErrors.serviceUnavailable.code)
                .send(clientErrors.serviceUnavailable)
        }
    }
}
