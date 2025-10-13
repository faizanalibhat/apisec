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

    async findAll(filters, sortOptions, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

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
        } catch (error) {
            this.handleError(error);
        }
    }

    async search(searchQuery, orgId, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            const searchConditions = {
                orgId,
                $text: { $search: searchQuery },
            };

            const [data, totalItems] = await Promise.all([
                RawEnvironment.find(searchConditions)
                    .populate('integrationId', 'name')
                    .sort({ score: { $meta: 'textScore' } })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                RawEnvironment.countDocuments(searchConditions),
            ]);

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