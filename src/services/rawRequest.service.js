import RawRequest from '../models/rawRequest.model.js';
import Integration from '../models/integration.model.js';
import { ApiError } from '../utils/ApiError.js';
import Vulnerability from '../models/vulnerability.model.js';
import TransformedRequest from '../models/transformedRequest.model.js';
import mongoose from 'mongoose';

class RawRequestService {
    async create(data) {
        try {
            // ADD validation for browser-extension source
            if (data.source === 'browser-extension') {
                // Set defaults for browser extension requests
                data.integrationId = data.integrationId || null;
                data.collectionName = data.collectionName || 'Browser Import';
                data.workspaceName = data.workspaceName || 'Browser Extension';
            } else {
                // For postman source, integrationId is still required
                if (!data.integrationId) {
                    throw ApiError.badRequest('Integration ID is required for Postman requests');
                }
            }

            // Generate raw HTTP format if not provided
            if (!data.rawHttp) {
                data.rawHttp = this.generateRawHttp(data);
            }

            const rawRequest = await RawRequest.create(data);
            return rawRequest;
        } catch (error) {
            this.handleError(error);
        }
    }

    async getProjectSummary(projectId, orgId) {
        if (!projectId) return null;

        // Ensure projectId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            // Or handle as an error, depending on desired behavior
            return null; 
        }

        const objectId = new mongoose.Types.ObjectId(projectId);

        // 1. Get all raw request IDs for the project
        const rawRequests = await RawRequest.find({ projectIds: objectId, orgId }).select('_id').lean();
        const rawRequestIds = rawRequests.map(r => r._id);

        if (rawRequestIds.length === 0) {
            return {
                totalRequests: 0,
                totalTransformedRequests: 0,
                totalRequestsSent: 0,
                totalVulnsFound: 0
            };
        }

        // 2. Get total transformed requests
        const totalTransformedRequests = await TransformedRequest.countDocuments({
            requestId: { $in: rawRequestIds }
        });

        // 3. Get total requests sent (state: 'complete')
        const totalRequestsSent = await TransformedRequest.countDocuments({
            requestId: { $in: rawRequestIds },
            state: 'complete'
        });

        // 4. Get total vulnerabilities found
        const totalVulnsFound = await Vulnerability.countDocuments({
            "requestSnapshot._id": { $in: rawRequestIds }
        });

        return {
            totalRequests: rawRequestIds.length,
            totalTransformedRequests,
            totalRequestsSent,
            totalVulnsFound
        };
    }

    async findAllWithSort(filters, sortOptions, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            // Extract hasVulns filter
            const { hasVulns, severity, ...mongoFilters } = filters;

            const pipeline = [
                { $match: mongoFilters },
                {
                    $lookup: {
                        from: "vulnerabilities",
                        let: { raw_request_id: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$requestSnapshot._id", "$$raw_request_id"]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: "$severity",
                                    count: { $sum: 1 }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    severities: {
                                        $push: {
                                            k: "$_id",
                                            v: "$count"
                                        }
                                    },
                                    total: { $sum: "$count" }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    stats: {
                                        $concatArrays: [
                                            "$severities",
                                            [{ k: "total", v: "$total" }]
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "vulnStats"
                    }
                }
            ];

            // Add hasVulns filtering
            if (hasVulns !== undefined) {
                if (hasVulns === 'true') {
                    pipeline.push({ $match: { "vulnStats.0": { $exists: true } } });
                } else if (hasVulns === 'false') {
                    pipeline.push({ $match: { "vulnStats": { $size: 0 } } });
                }
            }

            // Now, add the vulnCounts field
            pipeline.push({
                $addFields: {
                    vulnCounts: {
                        $cond: [
                            { $gt: [{ $size: "$vulnStats" }, 0] },
                            { $arrayToObject: { $arrayElemAt: ["$vulnStats.stats", 0] } },
                            {}
                        ]
                    }
                }
            });

            // Add severity filtering
            if (severity) {
                const severities = Array.isArray(severity) ? severity : severity.split(',');
                const severityConditions = severities
                    .filter(s => ['critical', 'high', 'medium', 'low', 'info'].includes(s))
                    .map(s => ({ [`vulnCounts.${s}`]: { $gt: 0 } }));

                if (severityConditions.length > 0) {
                    pipeline.push({ $match: { $or: severityConditions } });
                }
            }

            // Continue with the rest of the pipeline
            pipeline.push(
                {
                    $lookup: {
                        from: "integrations",
                        localField: "integrationId",
                        foreignField: "_id",
                        as: "integration"
                    }
                },
                {
                    $unwind: {
                        path: "$integration",
                        preserveNullAndEmptyArrays: true
                    }
                },
                // Add postman URL field
                {
                    $addFields: {
                        postmanUrl: {
                            $cond: {
                                if: { $and: [{ $ne: ["$integration", null] }, { $ne: ["$source", "browser-extension"] }] },
                                then: {
                                    $let: {
                                        vars: {
                                            collectionData: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: {
                                                                $reduce: {
                                                                    input: "$integration.workspaces",
                                                                    initialValue: [],
                                                                    in: {
                                                                        $concatArrays: [
                                                                            "$$value",
                                                                            {
                                                                                $map: {
                                                                                    input: "$$this.collections",
                                                                                    as: "collection",
                                                                                    in: {
                                                                                        $mergeObjects: [
                                                                                            "$$collection",
                                                                                            {
                                                                                                workspaceName: "$$this.name",
                                                                                                workspaceId: "$$this.id"
                                                                                            }
                                                                                        ]
                                                                                    }
                                                                                }
                                                                            }
                                                                        ]
                                                                    }
                                                                }
                                                            },
                                                            cond: { $eq: ["$$this.name", "$collectionName"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: "$$collectionData.postmanUrl"
                                    }
                                },
                                else: null
                            }
                        }
                    }
                },
                // Clean up integration field to only include necessary data
                {
                    $addFields: {
                        integrationId: {
                            _id: "$integration._id",
                            name: "$integration.name"
                        }
                    }
                },
                { $sort: sortOptions },
                // Facet for pagination - split into data and totalCount
                {
                    $facet: {
                        data: [
                            { $skip: skip },
                            { $limit: limit },
                            { $project: { vulnStats: 0, integration: 0 } }
                        ],
                        totalCount: [
                            { $count: "total" }
                        ]
                    }
                }
            );

            const result = await RawRequest.aggregate(pipeline);
            const totalItems = result[0].totalCount[0]?.total || 0;

            const projectId = filters.projectIds ? filters.projectIds.toString() : null;
            const summary = await this.getProjectSummary(projectId, filters.orgId);

            return {
                data: result[0].data,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit,
                summary
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async searchWithFiltersAndSort(searchQuery, additionalFilters, sortOptions, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            // Extract vulnerability filters
            const { hasVulns, severity, ...mongoFilters } = additionalFilters;

            // For search, we need to use aggregation pipeline instead of find()
            const pipeline = [
                {
                    $match: {
                        ...mongoFilters,
                        $text: { $search: searchQuery }
                    }
                },
                {
                    $addFields: {
                        score: { $meta: 'textScore' }
                    }
                },
                {
                    $lookup: {
                        from: "vulnerabilities",
                        let: { raw_request_id: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$requestSnapshot._id", "$$raw_request_id"]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: "$severity",
                                    count: { $sum: 1 }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    severities: {
                                        $push: {
                                            k: "$_id",
                                            v: "$count"
                                        }
                                    },
                                    total: { $sum: "$count" }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    stats: {
                                        $concatArrays: [
                                            "$severities",
                                            [{ k: "total", v: "$total" }]
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "vulnStats"
                    }
                }
            ];

            // Add hasVulns filtering
            if (hasVulns !== undefined) {
                if (hasVulns === 'true') {
                    pipeline.push({ $match: { "vulnStats.0": { $exists: true } } });
                } else if (hasVulns === 'false') {
                    pipeline.push({ $match: { "vulnStats": { $size: 0 } } });
                }
            }

            // Now, add the vulnCounts field
            pipeline.push({
                $addFields: {
                    vulnCounts: {
                        $cond: [
                            { $gt: [{ $size: "$vulnStats" }, 0] },
                            { $arrayToObject: { $arrayElemAt: ["$vulnStats.stats", 0] } },
                            {}
                        ]
                    }
                }
            });

            // Add severity filtering
            if (severity) {
                const severities = Array.isArray(severity) ? severity : severity.split(',');
                const severityConditions = severities
                    .filter(s => ['critical', 'high', 'medium', 'low', 'info'].includes(s))
                    .map(s => ({ [`vulnCounts.${s}`]: { $gt: 0 } }));

                if (severityConditions.length > 0) {
                    pipeline.push({ $match: { $or: severityConditions } });
                }
            }

            // Add integration lookup and postman URL
            pipeline.push(
                {
                    $lookup: {
                        from: "integrations",
                        localField: "integrationId",
                        foreignField: "_id",
                        as: "integration"
                    }
                },
                {
                    $unwind: {
                        path: "$integration",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $addFields: {
                        postmanUrl: {
                            $cond: {
                                if: { $and: [{ $ne: ["$integration", null] }, { $ne: ["$source", "browser-extension"] }] },
                                then: {
                                    $let: {
                                        vars: {
                                            collectionData: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: {
                                                                $reduce: {
                                                                    input: "$integration.workspaces",
                                                                    initialValue: [],
                                                                    in: {
                                                                        $concatArrays: [
                                                                            "$$value",
                                                                            {
                                                                                $map: {
                                                                                    input: "$$this.collections",
                                                                                    as: "collection",
                                                                                    in: {
                                                                                        $mergeObjects: [
                                                                                            "$$collection",
                                                                                            {
                                                                                                workspaceName: "$$this.name",
                                                                                                workspaceId: "$$this.id"
                                                                                            }
                                                                                        ]
                                                                                    }
                                                                                }
                                                                            }
                                                                        ]
                                                                    }
                                                                }
                                                            },
                                                            cond: { $eq: ["$$this.name", "$collectionName"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: "$$collectionData.postmanUrl"
                                    }
                                },
                                else: null
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        integrationId: {
                            _id: "$integration._id",
                            name: "$integration.name"
                        }
                    }
                },
                {
                    $sort: {
                        score: -1,  // Sort by text score first
                        ...sortOptions
                    }
                },
                {
                    $facet: {
                        data: [
                            { $skip: skip },
                            { $limit: limit },
                            { $project: { vulnStats: 0, integration: 0, score: 0 } }
                        ],
                        totalCount: [
                            { $count: "total" }
                        ]
                    }
                }
            );

            const result = await RawRequest.aggregate(pipeline);
            const totalItems = result[0].totalCount[0]?.total || 0;

            const projectId = additionalFilters.projectIds ? additionalFilters.projectIds.toString() : null;
            const summary = await this.getProjectSummary(projectId, additionalFilters.orgId);

            return {
                data: result[0].data,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit,
                summary
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async findOne(id, orgId) {
        try {
            const rawRequest = await RawRequest.findOne({
                _id: id,
                orgId,
            })
                .populate({
                    path: 'integrationId',
                    select: 'name postmanUserId postmanTeamDomain workspaces',
                    match: { _id: { $exists: true } }  // ADD to handle null
                })
                .lean();

            if (!rawRequest) {
                throw ApiError.notFound('Raw request not found');
            }

            // Get vulnerability counts for this single request
            const vulnCounts = await Vulnerability.aggregate([
                {
                    $match: { "requestSnapshot._id": rawRequest._id }
                },
                {
                    $group: {
                        _id: "$severity",
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        k: "$_id",
                        v: "$count"
                    }
                }
            ]);

            // Convert to object
            rawRequest.vulnCounts = vulnCounts.length > 0
                ? vulnCounts.reduce((acc, curr) => {
                    acc[curr.k] = curr.v;
                    return acc;
                }, {})
                : {};

            // Add postman URL if integration exists
            if (rawRequest.integrationId && rawRequest.source !== 'browser-extension') {
                const integration = rawRequest.integrationId;
                const collectionData = this.findCollectionInIntegration(
                    integration,
                    rawRequest.collectionName,
                    rawRequest.workspaceName
                );

                if (collectionData) {
                    rawRequest.postmanUrl = collectionData.postmanUrl;
                }

                // Clean up integration data
                rawRequest.integrationId = {
                    _id: integration._id,
                    name: integration.name
                };
            }

            return rawRequest;
        } catch (error) {
            this.handleError(error);
        }
    }

    async update(id, updateData, orgId) {
        try {
            // Remove fields that shouldn't be updated
            const { _id, orgId: _, integrationId, createdAt, updatedAt, ...validUpdateData } = updateData;

            // Regenerate rawHttp if request details changed
            if (validUpdateData.method || validUpdateData.url || validUpdateData.headers || validUpdateData.body) {
                validUpdateData.rawHttp = this.generateRawHttp({
                    ...validUpdateData,
                    method: validUpdateData.method || 'GET',
                });
            }

            const rawRequest = await RawRequest.findOneAndUpdate(
                { _id: id, orgId },
                validUpdateData,
                { new: true, runValidators: true }
            )
                .populate('integrationId', 'name')
                .lean();

            if (!rawRequest) {
                throw ApiError.notFound('Raw request not found');
            }

            return rawRequest;
        } catch (error) {
            this.handleError(error);
        }
    }

    async delete(id, orgId) {
        try {
            const result = await RawRequest.findOneAndDelete({
                _id: id,
                orgId,
            });

            if (!result) {
                throw ApiError.notFound('Raw request not found');
            }

            return result;
        } catch (error) {
            this.handleError(error);
        }
    }

    async bulkDelete(requestIds, orgId) {
        try {
            if (!Array.isArray(requestIds) || requestIds.length === 0) {
                throw ApiError.badRequest('Request IDs must be a non-empty array');
            }

            const result = await RawRequest.deleteMany({
                _id: { $in: requestIds },
                orgId,
            });

            return {
                deletedCount: result.deletedCount,
                requestedCount: requestIds.length,
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteByIntegrationId(integrationId, orgId) {
        try {
            const result = await RawRequest.deleteMany({
                integrationId,
                orgId,
            });

            return result.deletedCount;
        } catch (error) {
            this.handleError(error);
        }
    }

    // Helper method to find collection in integration data
    findCollectionInIntegration(integration, collectionName, workspaceName) {
        if (!integration || !integration.workspaces) return null;

        for (const workspace of integration.workspaces) {
            if (workspace.name === workspaceName) {
                const collection = workspace.collections.find(c => c.name === collectionName);
                if (collection) {
                    return {
                        collection,
                        workspace,
                        postmanUrl: collection.postmanUrl
                    };
                }
            }
        }
        return null;
    }

    generateRawHttp(requestData) {
        const { method = 'GET', url = '', headers = {}, body = null } = requestData;

        let rawHttp = `${method} ${url} HTTP/1.1\n`;

        // Handle headers as either object or array
        if (Array.isArray(headers)) {
            headers.forEach(header => {
                rawHttp += `${header.key}: ${header.value}\n`;
            });
        } else if (headers && typeof headers === 'object') {
            Object.entries(headers).forEach(([key, value]) => {
                rawHttp += `${key}: ${value}\n`;
            });
        }

        // Add body if present
        if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
            rawHttp += '\n';
            if (typeof body === 'object') {
                rawHttp += JSON.stringify(body, null, 2);
            } else {
                rawHttp += body;
            }
        }

        return rawHttp;
    }

    handleError(error) {
        console.log(error);
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message,
            }));
            throw ApiError.validationError('Validation failed', errors);
        }

        if (error.name === 'CastError') {
            throw ApiError.badRequest('Invalid ID format');
        }

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            throw ApiError.conflict(`Duplicate value for ${field}`);
        }

        if (error instanceof ApiError) {
            throw error;
        }

        throw ApiError.internal('An error occurred while processing the request');
    }
}

export default RawRequestService;