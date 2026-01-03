type HealthHandlerArgs = {
    name: string
}

export function createHealthHandler({ name }: HealthHandlerArgs) {
    return function health(req: AppRequest, res: AppResponse) {
        return res.status(200).send({
            ok: true,
            name,
            uptimeSec: Math.round(process.uptime()),
            time: new Date().toISOString(),
            requestId: req.requestId,
        })
    }
}
