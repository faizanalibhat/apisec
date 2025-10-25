import RawRequest from '../models/rawRequest.model.js';
import Integration from '../models/integration.model.js';
import { ApiError } from '../utils/ApiError.js';

class RawRequestService {
    async create(data) {
        try {
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

    async findAllWithSort(filters, sortOptions, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            // Extract hasVulns filter
            const { hasVulns, ...mongoFilters } = filters;

            const pipeline = [
                { $match: mongoFilters },
                {
                    $lookup: {
                        from: "vulnerabilities",
                        localField: "_id",
                        foreignField: "requestId._id",
                        pipeline: [
                            {
                                $group: {
                                    _id: "$severity",
                                    count: { $sum: 1 }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    k: "$_id",   // key
                                    v: "$count"  // value
                                }
                            }
                        ],
                        as: "vulnStats"
                    }
                },
                {
                    // Convert array of {k,v} into an object like {high: 2, critical: 5, ...}
                    $addFields: {
                        vulnCounts: {
                            $cond: [
                                { $gt: [{ $size: "$vulnStats" }, 0] },
                                { $arrayToObject: "$vulnStats" },
                                {}
                            ]
                        },
                        hasVulnerabilities: { $gt: [{ $size: "$vulnStats" }, 0] }
                    }
                },
            ];

            // Add vulnerability filtering
            if (hasVulns) {
                const conditions = [];
                const severities = Array.isArray(hasVulns) ? hasVulns : [hasVulns];

                severities.forEach(severity => {
                    if (severity === 'true') {
                        conditions.push({ hasVulnerabilities: true });
                    } else if (severity === 'false') {
                        conditions.push({ hasVulnerabilities: false });
                    } else if (['critical', 'high', 'medium', 'low'].includes(severity)) {
                        conditions.push({ [`vulnCounts.${severity}`]: { $gt: 0 } });
                    }
                });

                if (conditions.length > 0) {
                    pipeline.push({ $match: { $or: conditions } });
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
                            { $project: { vulnStats: 0, integration: 0, hasVulnerabilities: 0 } }
                        ],
                        totalCount: [
                            { $count: "total" }
                        ]
                    }
                }
            );

            const result = await RawRequest.aggregate(pipeline);
            const totalItems = result[0].totalCount[0]?.total || 0;

            return {
                data: result[0].data,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit,
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async searchWithFiltersAndSort(searchQuery, additionalFilters, sortOptions, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            // Extract hasVulns filter
            const { hasVulns, ...mongoFilters } = additionalFilters;

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
                        localField: "_id",
                        foreignField: "requestId",
                        pipeline: [
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
                        ],
                        as: "vulnStats"
                    }
                },
                {
                    $addFields: {
                        vulnCounts: {
                            $cond: [
                                { $gt: [{ $size: "$vulnStats" }, 0] },
                                { $arrayToObject: "$vulnStats" },
                                {}
                            ]
                        },
                        hasVulnerabilities: { $gt: [{ $size: "$vulnStats" }, 0] }
                    }
                }
            ];

            // Add vulnerability filtering
            if (hasVulns) {
                if (hasVulns === 'true') {
                    pipeline.push({ $match: { hasVulnerabilities: true } });
                } else if (hasVulns === 'false') {
                    pipeline.push({ $match: { hasVulnerabilities: false } });
                } else if (['critical', 'high', 'medium', 'low'].includes(hasVulns)) {
                    pipeline.push({
                        $match: {
                            [`vulnCounts.${hasVulns}`]: { $gt: 0 }
                        }
                    });
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
                            { $project: { vulnStats: 0, integration: 0, hasVulnerabilities: 0, score: 0 } }
                        ],
                        totalCount: [
                            { $count: "total" }
                        ]
                    }
                }
            );

            const result = await RawRequest.aggregate(pipeline);
            const totalItems = result[0].totalCount[0]?.total || 0;

            return {
                data: result[0].data,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit,
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async searchWithFiltersAndSort(searchQuery, additionalFilters, sortOptions, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            const searchConditions = {
                ...additionalFilters,
                $text: { $search: searchQuery },
            };

            // Build sort with text score for search relevance
            const searchSort = {
                score: { $meta: 'textScore' },
                ...sortOptions
            };

            // First get the raw requests with search
            const [rawRequests, totalItems] = await Promise.all([
                RawRequest.find(searchConditions)
                    .populate('integrationId', 'name postmanUserId postmanTeamDomain workspaces')
                    .sort(searchSort)
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                RawRequest.countDocuments(searchConditions),
            ]);

            // Process each request to add postman URL
            const data = rawRequests.map(request => {
                const result = { ...request };

                if (request.integrationId) {
                    // Find the matching collection in integration
                    const integration = request.integrationId;
                    const collectionData = this.findCollectionInIntegration(
                        integration,
                        request.collectionName,
                        request.workspaceName
                    );

                    if (collectionData) {
                        result.postmanUrl = collectionData.postmanUrl;
                    }

                    // Clean up integration data
                    result.integrationId = {
                        _id: integration._id,
                        name: integration.name
                    };
                }

                return result;
            });

            return {
                data,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit,
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
                .populate('integrationId', 'name postmanUserId postmanTeamDomain workspaces')
                .lean();

            if (!rawRequest) {
                throw ApiError.notFound('Raw request not found');
            }

            // Add postman URL if integration exists
            if (rawRequest.integrationId) {
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

        // Add headers
        Object.entries(headers).forEach(([key, value]) => {
            rawHttp += `${key}: ${value}\n`;
        });

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