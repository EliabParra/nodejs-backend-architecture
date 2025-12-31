export function createHealthHandler({ name }) {
    return function health(req, res) {
        return res.status(200).send({
            ok: true,
            name,
            uptimeSec: Math.round(process.uptime()),
            time: new Date().toISOString(),
            requestId: req.requestId
        })
    }
}
