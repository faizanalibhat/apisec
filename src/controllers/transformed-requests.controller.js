import TransformedRequest from "../models/transformedRequest.model.js"
import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;



export class TransformedRequestsController {

    static getRequests = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { scanId } = req.query;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const filters = { orgId };

        if (scanId) filters.scanId = ObjectId.createFromHexString(scanId);

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
                            { $eq: ["$orgId", orgId] },
                            {
                            $and: [
                                { $ne: ["$$request_id", null] },
                                { $eq: ["$transformedRequestId._id", "$$request_id"] }
                            ]
                            }
                        ]
                        }
                    }
                    }
                ],
                as: "vulnerability"
            }
        },
        {
            $addFields: {
                vulnerability: { $ifNull: [{ $arrayElemAt: ["$vulnerability", 0] }, {}] }
            }
        },
        {
            $lookup: {
                from: "raw_requests",
                let: { request_id: "$requestId" },
                pipeline: [
                    {
                    $match: {
                        $expr: {
                        $and: [
                            { $eq: ["$orgId", orgId] },
                            {
                            $and: [
                                { $ne: ["$$request_id", null] },
                                { $eq: ["$_id", "$$request_id"] }
                            ]
                            }
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
                rawRequest: { $ifNull: [{ $arrayElemAt: ["$rawRequest", 0] }, {}] }
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
                            { $eq: ["$orgId", orgId] },
                            {
                            $and: [
                                { $ne: ["$$rule_id", null] },
                                { $eq: ["$_id", "$$rule_id"] }
                            ]
                            }
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
                rule: { $ifNull: [{ $arrayElemAt: ["$rule", 0] }, {}] }
            }
        },

        { $sort: { createdAt: -1 } },
        { $skip: Math.max((page - 1) * limit, 0) },
        { $limit: limit }
        ];


        const requests = await TransformedRequest.aggregate(pipeline);

        const total = await TransformedRequest.countDocuments(filters);

        return res.json({ requests, total });
    }
}