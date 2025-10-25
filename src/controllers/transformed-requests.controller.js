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
            {
                $lookup: {
                    from: "rawrequests",
                    let: { request_id: "$requestId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$_id", "$$request_id"] },
                                        { $eq: ["$orgId", orgId] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "rawRequest"
                }
            },
            {
                $addFields: {
                    rawRequest: { $arrayElemAt: ["$rawRequest", 0] }

                }
            },
            {
                $lookup: {
                    from: "rules",
                    let: { rule_id: "$ruleId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$_id", "$$rule_id"] },
                                        { $eq: ["$orgId", orgId] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "rule"
                }
            },
            {
                $addFields: {
                    rule: { $arrayElemAt: ["$rule", 0] }
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