import TransformedRequest from "../models/transformedRequest.model.js"



export class TransformedRequestsController {

    static getRequests = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { scanId } = req.query;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;


        const filters = { orgId };

        if (scanId) filters.scanId = scanId;

        const pipeline = [
            { $match: filters },
            {
                $lookup: {
                    from: "vulnerabilities",
                    let: { request_id: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$transformedRequestId._id", "$$request_id"] },
                                        { $eq: ["$orgId", orgId] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "vulnerabilities"
                }
            },
            {
                $addFields: {
                    vulnerabilitiesCount: { $size: "$vulnerabilities" }
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit }
        ];

        const requests = await TransformedRequest.find(filters).lean();

        const total = await TransformedRequest.countDocuments(filters);

        return res.json({ requests, total });
    }
}