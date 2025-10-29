import RawEnvironment from '../models/rawEnvironment.model.js';
import Integration from '../models/integration.model.js';
import { ApiError } from '../utils/ApiError.js';

class RawEnvironmentService {
    async create(data) {
        try {
            // Get integration to fetch Postman user info for URL generation
            const integration = await Integration.findById(data.integrationId)
                .select('postmanUserId postmanTeamDomain')
                .lean();

            if (!integration) {
                throw ApiError.notFound('Integration not found');
            }

            // Generate Postman URL
            const rawEnvironment = new RawEnvironment(data);
            rawEnvironment.postmanUrl = rawEnvironment.generatePostmanUrl(
                integration.postmanTeamDomain,
                integration.postmanUserId
            );

            await rawEnvironment.save();
            return rawEnvironment;
        } catch (error) {
            this.handleError(error);
        }
    }

    async findAll(filters, sortOptions, pagination, searchQuery) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            // If no search query, use the existing efficient find() method which is faster
            if (!searchQuery) {
                const [data, totalItems] = await Promise.all([
                    RawEnvironment.find(filters)
                        .populate('integrationId', 'name')
                        .sort(sortOptions)
                        .skip(skip)
                        .limit(limit)
                        .lean(),
                    RawEnvironment.countDocuments(filters)
                ]);

                return {
                    data,
                    currentPage: page,
                    totalPages: Math.ceil(totalItems / limit),
                    totalItems,
                    itemsPerPage: limit,
                };
            }

            // If there IS a search query, use a regex-based aggregation pipeline
            const pipeline = [
                // Stage 1: Match base filters like orgId
                { $match: filters },

                // Stage 2: Filter the values array based on regex search and store in a temp field
                {
                    $addFields: {
                        matchedValues: {
                            $filter: {
                                input: "$values",
                                as: "variable",
                                cond: {
                                    $or: [
                                        { $regexMatch: { input: "$variable.key", regex: searchQuery, options: "i" } },
                                        { $regexMatch: { input: { $toString: "$variable.value" }, regex: searchQuery, options: "i" } }
                                    ]
                                }
                            }
                        }
                    }
                },

                // Stage 3: Keep documents that either have a name match OR have matching values
                {
                    $match: {
                        $or: [
                            { "name": { $regex: searchQuery, $options: "i" } },
                            { "matchedValues.0": { $exists: true } }
                        ]
                    }
                },

                // Stage 4: Replace original values with the filtered ones, unless no values matched (then keep original)
                {
                    $addFields: {
                        values: {
                           $cond: {
                               if: { $gt: [ { $size: "$matchedValues" }, 0 ] },
                               then: "$matchedValues",
                               else: "$values"
                           }
                        }
                    }
                },
                
                // Stage 5: Populate integrationId
                {
                    $lookup: {
                        from: 'integrations',
                        localField: 'integrationId',
                        foreignField: '_id',
                        as: 'integrationId'
                    }
                },
                {
                    $unwind: {
                        path: '$integrationId',
                        preserveNullAndEmptyArrays: true
                    }
                },
                 {
                    $addFields: {
                        "integrationId": {
                            _id: "$integrationId._id",
                            name: "$integrationId.name"
                        }
                    }
                },

                // Stage 6: Facet for pagination and total count
                {
                    $facet: {
                        data: [
                            { $sort: sortOptions },
                            { $skip: skip },
                            { $limit: limit },
                            { $project: { matchedValues: 0 } } // Clean up temp field
                        ],
                        totalCount: [
                            { $count: "total" }
                        ]
                    }
                }
            ];

            const result = await RawEnvironment.aggregate(pipeline);
            
            const data = result[0].data;
            const totalItems = result[0].totalCount[0]?.total || 0;

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

    async findByWorkspace(workspaceId, orgId) {
        try {
            const environments = await RawEnvironment.find({
                workspaceId,
                orgId,
            })
                .populate('integrationId', 'name')
                .sort({ name: 1 })
                .lean();

            return environments;
        } catch (error) {
            this.handleError(error);
        }
    }

    async findOne(id, orgId) {
        try {
            const environment = await RawEnvironment.findOne({
                _id: id,
                orgId,
            })
                .populate('integrationId', 'name postmanUserId postmanTeamDomain')
                .lean();

            if (!environment) {
                throw ApiError.notFound('Raw environment not found');
            }

            // Regenerate Postman URL if we have the integration data
            if (environment.integrationId && !environment.postmanUrl) {
                const integration = environment.integrationId;
                environment.postmanUrl = this.generatePostmanUrl(
                    environment.workspaceName,
                    environment.workspaceId,
                    environment.postmanUid,
                    integration.postmanTeamDomain,
                    integration.postmanUserId
                );
            }

            return environment;
        } catch (error) {
            this.handleError(error);
        }
    }

    async update(id, updateData, orgId) {
        try {
            // Remove fields that shouldn't be updated
            const {
                _id,
                orgId: _,
                integrationId,
                postmanEnvironmentId,
                postmanUid,
                createdAt,
                updatedAt,
                postmanUrl,
                ...validUpdateData
            } = updateData;

            const environment = await RawEnvironment.findOneAndUpdate(
                { _id: id, orgId },
                validUpdateData,
                { new: true, runValidators: true }
            )
                .populate('integrationId', 'name')
                .lean();

            if (!environment) {
                throw ApiError.notFound('Raw environment not found');
            }

            return environment;
        } catch (error) {
            this.handleError(error);
        }
    }

    async delete(id, orgId) {
        try {
            const result = await RawEnvironment.findOneAndDelete({
                _id: id,
                orgId,
            });

            if (!result) {
                throw ApiError.notFound('Raw environment not found');
            }

            return result;
        } catch (error) {
            this.handleError(error);
        }
    }

    async bulkDelete(environmentIds, orgId) {
        try {
            if (!Array.isArray(environmentIds) || environmentIds.length === 0) {
                throw ApiError.badRequest('Environment IDs must be a non-empty array');
            }

            const result = await RawEnvironment.deleteMany({
                _id: { $in: environmentIds },
                orgId,
            });

            return {
                deletedCount: result.deletedCount,
                requestedCount: environmentIds.length,
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteByIntegrationId(integrationId, orgId) {
        try {
            const result = await RawEnvironment.deleteMany({
                integrationId,
                orgId,
            });

            return result.deletedCount;
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteByWorkspaceId(workspaceId, integrationId, orgId) {
        try {
            const result = await RawEnvironment.deleteMany({
                workspaceId,
                integrationId,
                orgId,
            });

            return result.deletedCount;
        } catch (error) {
            this.handleError(error);
        }
    }

    // Helper method to generate Postman URL
    generatePostmanUrl(workspaceName, workspaceId, environmentUid, teamDomain, userId) {
        if (!teamDomain || !userId) {
            return null;
        }

        return `https://${teamDomain}.postman.co/workspace/${encodeURIComponent(workspaceName)}~${workspaceId}/environment/${userId}-${environmentUid}`;
    }

    // Batch create environments (useful during integration sync)
    async bulkCreate(environments, orgId) {
        try {
            if (!Array.isArray(environments) || environments.length === 0) {
                return [];
            }

            // Ensure all environments have orgId
            const environmentsWithOrgId = environments.map(env => ({
                ...env,
                orgId,
            }));

            const result = await RawEnvironment.insertMany(environmentsWithOrgId, {
                ordered: false, // Continue on error
                rawResult: true,
            });

            return result;
        } catch (error) {
            if (error.code === 11000) {
                // Handle duplicate key errors gracefully during bulk insert
                console.warn('Some environments already exist, continuing...');
                return { insertedCount: error.result?.nInserted || 0 };
            }
            this.handleError(error);
        }
    }

    // Update or create environment (upsert)
    async upsert(filter, data, orgId) {
        try {
            const environment = await RawEnvironment.findOneAndUpdate(
                { ...filter, orgId },
                { $set: { ...data, orgId } },
                {
                    new: true,
                    upsert: true,
                    runValidators: true
                }
            );

            return environment;
        } catch (error) {
            this.handleError(error);
        }
    }

    // Get environment variables as key-value pairs
    async getVariables(id, orgId) {
        try {
            const environment = await RawEnvironment.findOne({
                _id: id,
                orgId,
            }).lean();

            if (!environment) {
                throw ApiError.notFound('Raw environment not found');
            }

            // Convert to key-value object
            const variables = {};
            environment.values
                .filter(v => v.enabled && v.key)
                .forEach(v => {
                    variables[v.key] = v.value;
                });

            return variables;
        } catch (error) {
            this.handleError(error);
        }
    }

    // Add environment key values variable
    async addVariable(id, orgId, variableData) {
        try {
            const environment = await RawEnvironment.findOne({
                _id: id,
                orgId,
            });

            if (!environment) {
                throw ApiError.notFound('Raw environment not found');
            }

            // Check if variable with same key already exists
            const existingIndex = environment.values.findIndex(v => v.key === variableData.key);
            if (existingIndex !== -1) {
                throw ApiError.conflict(`Variable with key '${variableData.key}' already exists`);
            }

            // Add new variable
            environment.values.push({
                key: variableData.key,
                value: variableData.value || '',
                type: variableData.type || 'default',
                enabled: variableData.enabled !== false
            });

            // Mark as edited
            environment.isEdited = true;
            if (!environment.originalData) {
                environment.originalData = { values: [...environment.values.slice(0, -1)] };
            }

            await environment.save();

            // Return the newly added variable
            return environment.values[environment.values.length - 1];
        } catch (error) {
            this.handleError(error);
        }
    }

    // Update environment key values variable
    async updateVariable(id, orgId, key, updateData) {
        try {
            const environment = await RawEnvironment.findOne({
                _id: id,
                orgId,
            });

            if (!environment) {
                throw ApiError.notFound('Raw environment not found');
            }

            // Find the variable
            const variableIndex = environment.values.findIndex(v => v.key === key);
            if (variableIndex === -1) {
                throw ApiError.notFound(`Variable with key '${key}' not found`);
            }

            // Store original if not already stored
            if (!environment.originalData) {
                environment.originalData = { values: JSON.parse(JSON.stringify(environment.values)) };
            }

            // Update the variable
            const variable = environment.values[variableIndex];
            if (updateData.value !== undefined) variable.value = updateData.value;
            if (updateData.type !== undefined) variable.type = updateData.type;
            if (updateData.enabled !== undefined) variable.enabled = updateData.enabled;

            // Mark as edited
            environment.isEdited = true;

            await environment.save();

            return environment.values[variableIndex];
        } catch (error) {
            this.handleError(error);
        }
    }

    // Delete environment key values variable
    async deleteVariable(id, orgId, key) {
        try {
            const environment = await RawEnvironment.findOne({
                _id: id,
                orgId,
            });

            if (!environment) {
                throw ApiError.notFound('Raw environment not found');
            }

            // Find the variable
            const variableIndex = environment.values.findIndex(v => v.key === key);
            if (variableIndex === -1) {
                throw ApiError.notFound(`Variable with key '${key}' not found`);
            }

            // Store original if not already stored
            if (!environment.originalData) {
                environment.originalData = { values: JSON.parse(JSON.stringify(environment.values)) };
            }

            // Remove the variable
            const deletedVariable = environment.values.splice(variableIndex, 1)[0];

            // Mark as edited
            environment.isEdited = true;

            await environment.save();

            return {
                deleted: true,
                variable: deletedVariable
            };
        } catch (error) {
            this.handleError(error);
        }
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

export default RawEnvironmentService;