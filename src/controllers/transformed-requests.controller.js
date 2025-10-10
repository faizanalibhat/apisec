import TransformedRequest from "../models/transformedRequest.model"



export class TransformedRequestsController {

    static getRequests = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { scanId } = req.query;

        const filters = { orgId };

        if (scanId) filters.scanId = scanId;

        const requests = await TransformedRequest.find(filters).lean();

        const total = await TransformedRequest.countDocuments(filters);

        return res.json({ requests, total });
    }
}