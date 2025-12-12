import TransformedRequest from "../models/transformedRequest.model.js"
import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;
import { escapeRegex } from "../utils/utils.js";



export class TransformedRequestsController {

    static getRequests = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { scanId, search, method, statusCode, ruleId, hasVulns, projectId } = req.query;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const filters = { orgId };

        if (scanId) filters.scanId = ObjectId.createFromHexString(scanId);

        if (search) {
            filters.$or = [
                { url: { $regex: escapeRegex(search), $options: "i" } },
                { 'rawRequest.name': { $regex: escapeRegex(search), $options: "i" } }
            ];
        }

        if (method) {
            filters.method = { $in: method.split(",") };
        }

        if (statusCode) {
            filters["executionResult.responseStatus"] = { $in: String(statusCode)?.split(",")?.map(s => parseInt(s)) };
        }

        if (ruleId) {
            filters.ruleId = ObjectId.createFromHexString(ruleId);
        }

        if (hasVulns) {
            filters.vulnerabilityDetected = hasVulns === 'true';
        }

        if (projectId) filters.projectId = { $in: [ObjectId.createFromHexString(projectId)] };

        console.log("JSON FILTERS: ", JSON.stringify(filters));

        const pipeline = [

            // --- Match ---
            { $match: { ...filters } },

            // --- Pagination ---
            { $sort: { createdAt: -1 } },
            { $skip: Math.max((page - 1) * limit, 0) },
            { $limit: limit },

            // --- Lookup Vulnerability ---
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
                                        { $ne: ["$$request_id", null] },
                                        { $eq: [{ $toObjectId: "$transformedRequestSnapshot._id" }, "$$request_id"] }
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
                    vulnerability: {
                        $ifNull: [{ $arrayElemAt: ["$vulnerability", 0] }, null]
                    },
                }
            },
            {
                $addFields: {
                    vulnerabilityDetected: {
                        $cond: {
                            if: { $eq: ["$vulnerability", null] },
                            then: false,
                            else: true
                        }
                    }
                }
            },

            // --- Lookup Raw Request ---
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
                                        { $ne: ["$$request_id", null] },
                                        { $eq: ["$_id", "$$request_id"] }
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
                    rawRequest: {
                        $ifNull: [{ $arrayElemAt: ["$rawRequest", 0] }, {}]
                    }
                }
            },
            // --- Lookup Rule ---
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
                                        { $ne: ["$$rule_id", null] },
                                        { $eq: ["$_id", "$$rule_id"] }
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
                    rule: {
                        $ifNull: [{ $arrayElemAt: ["$rule", 0] }, {}]
                    }
                }
            }
        ];

        const requests = await TransformedRequest.aggregate(pipeline);

        const total = await TransformedRequest.countDocuments(filters);

        const supported_filters = {};

        supported_filters.method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        supported_filters.statusCode = await TransformedRequest.distinct("executionResult.responseStatus", { orgId });

        return res.json({ requests, total, filters: supported_filters });
    }
}