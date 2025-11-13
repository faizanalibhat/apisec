import { mqbroker } from '../services/rabbitmq.service.js';

export const activityLogger = (req, res, next) => {
    const originalSend = res.send;

    res.send = async function (body) {
        try {
            const requestData = {
                method: req.method,
                path: req.path,
                headers: req.headers,
                query: req.query,
                params: req.params,
                body: req.body,
                ip: req.ip,
                originalUrl: req.originalUrl,
                authContext: req.authenticatedService,
                origin: "apisec",
                response: {
                    statusCode: res.statusCode,
                    body: body ? body.toString() : null
                }
            };
            if (req.path !== '/health') {
                await mqbroker.publish("activitylogs", "activitylogs.all", requestData);
            }
        } catch (error) {
            console.error("Failed to publish activity log", error)
        }
        originalSend.apply(res, arguments);
    };

    next();
};
