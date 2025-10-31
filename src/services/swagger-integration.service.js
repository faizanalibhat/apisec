import Integration from '../models/integration.model.js';
import RawRequest from '../models/rawRequest.model.js';
import RawEnvironment from '../models/rawEnvironment.model.js';
import { ApiError } from '../utils/ApiError.js';
import { SwaggerClient } from '../utils/swagger/swaggerClient.js';
import { SwaggerParser } from '../utils/swagger/swaggerParser.js';
import { mqbroker } from './rabbitmq.service.js';

class SwaggerIntegrationService {
    constructor() {
        this.swaggerClient = new SwaggerClient();
        this.swaggerParser = new SwaggerParser();
    }

    async createIntegration(data) {
        try {
            const { sourceUrl, name, description, orgId } = data;

            // Validate and fetch Swagger spec
            const specData = await this.swaggerClient.fetchSwaggerSpec(sourceUrl);

            // Extract basic info from spec
            const swaggerInfo = this.swaggerParser.extractBasicInfo(specData.spec);

            // Create temporary environment
            const environmentVariables = this.swaggerParser.createEnvironmentFromSpec(specData.spec);
            const environment = await RawEnvironment.create({
                orgId,
                name: `${name || swaggerInfo.title} - Environment`,
                values: environmentVariables,
                workspaceName: 'Swagger Import',
                isActive: true
            });

            // Create integration
            const integration = await Integration.create({
                orgId,
                type: 'swagger',
                environmentId: environment._id,
                name: name || swaggerInfo.title,
                description: description || swaggerInfo.description,
                sourceUrl,
                swaggerInfo: {
                    title: swaggerInfo.title,
                    version: swaggerInfo.version,
                    description: swaggerInfo.description,
                    host: swaggerInfo.host,
                    basePath: swaggerInfo.basePath,
                    schemes: swaggerInfo.schemes,
                    servers: swaggerInfo.servers
                },
                swaggerSpec: specData.spec,
                metadata: {
                    status: 'pending',
                    totalEndpoints: swaggerInfo.totalEndpoints
                }
            });

            // Trigger async sync process
            await mqbroker.publish("apisec", "apisec.integration.sync", {
                integration,
                sourceUrl,
                environment: {}
            });

            // Return integration without spec data
            const integrationData = integration.toObject();
            delete integrationData.swaggerSpec;

            return integrationData;
        } catch (error) {
            this.handleError(error);
        }
    }

    async getIntegrations(orgId, page, limit, search) {
        try {
            const skip = (page - 1) * limit;

            const query = {
                orgId,
                type: 'swagger'
            };

            if (search) {
                query.$text = { $search: search };
            }

            const [integrations, totalItems] = await Promise.all([
                Integration.find(query)
                    .select('-swaggerSpec')
                    .skip(skip)
                    .limit(limit)
                    .sort({ createdAt: -1 })
                    .lean(),
                Integration.countDocuments(query)
            ]);

            const totalPages = Math.ceil(totalItems / limit);

            return {
                integrations,
                currentPage: page,
                totalPages,
                totalItems,
                itemsPerPage: limit
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getIntegration(id, orgId) {
        try {
            const integration = await Integration.findOne({
                _id: id,
                orgId,
                type: 'swagger'
            }).select('-swaggerSpec').lean();

            if (!integration) {
                throw ApiError.notFound('Swagger integration not found');
            }

            return integration;
        } catch (error) {
            this.handleError(error);
        }
    }

    async updateIntegration(id, orgId, updateData) {
        try {
            const { name, description } = updateData;

            const integration = await Integration.findOneAndUpdate(
                { _id: id, orgId, type: 'swagger' },
                {
                    $set: {
                        ...(name && { name }),
                        ...(description !== undefined && { description })
                    }
                },
                { new: true, runValidators: true }
            ).select('-swaggerSpec');

            if (!integration) {
                throw ApiError.notFound('Swagger integration not found');
            }

            return integration;
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteIntegration(id, orgId) {
        try {
            const integration = await Integration.findOne({
                _id: id,
                orgId,
                type: 'swagger'
            });

            if (!integration) {
                throw ApiError.notFound('Swagger integration not found');
            }

            // Delete all raw requests
            await RawRequest.deleteMany({
                integrationId: integration._id,
                orgId,
                source: 'swagger'
            });

            // Delete associated environment
            if (integration.environmentId) {
                await RawEnvironment.deleteOne({
                    _id: integration.environmentId,
                    orgId
                });
            }

            // Delete the integration
            await integration.deleteOne();

            return { message: 'Swagger integration and associated data deleted successfully' };
        } catch (error) {
            this.handleError(error);
        }
    }

    async refreshIntegration(id, orgId) {
        try {
            const integration = await Integration.findOne({
                _id: id,
                orgId,
                type: 'swagger'
            });

            if (!integration) {
                throw ApiError.notFound('Swagger integration not found');
            }

            // Delete existing raw requests
            await RawRequest.deleteMany({
                integrationId: integration._id,
                orgId,
                source: 'swagger'
            });

            // Reset metadata
            integration.metadata.status = 'pending';
            integration.metadata.totalRequests = 0;
            await integration.save();

            // Trigger sync again
            await mqbroker.publish("apisec", "apisec.integration.sync", {
                integration,
                sourceUrl: integration.sourceUrl,
                environment: {}
            });

            const updatedIntegration = await Integration.findById(id).select('-swaggerSpec').lean();
            return updatedIntegration;
        } catch (error) {
            this.handleError(error);
        }
    }

    async validateSwaggerUrl(sourceUrl) {
        try {
            const result = await this.swaggerClient.validateUrl(sourceUrl);
            return {
                valid: result.valid,
                version: result.version,
                info: result.info
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async syncIntegration(integration, sourceUrl, environment) {
        try {
            // Update status
            await Integration.updateOne(
                { _id: integration._id },
                { $set: { 'metadata.status': 'syncing' } }
            );

            // Fetch latest spec
            const specData = await this.swaggerClient.fetchSwaggerSpec(sourceUrl);

            // Parse endpoints into raw requests
            const rawRequests = await this.swaggerParser.parseSwaggerToRawRequests(
                specData.spec,
                {
                    orgId: integration.orgId,
                    integrationId: integration._id,
                    integrationName: integration.name
                }
            );

            // Bulk insert raw requests
            if (rawRequests && rawRequests.length > 0) {
                await RawRequest.insertMany(rawRequests);
            }

            // Update integration metadata
            await Integration.updateOne(
                { _id: integration._id },
                {
                    $set: {
                        'metadata.status': 'completed',
                        'metadata.lastSyncedAt': new Date(),
                        'metadata.totalRequests': rawRequests.length,
                        'metadata.lastError': null,
                        'swaggerSpec': specData.spec
                    }
                }
            );

        } catch (error) {
            // Update with error status
            await Integration.updateOne(
                { _id: integration._id },
                {
                    $set: {
                        'metadata.status': 'failed',
                        'metadata.lastError': error.message
                    }
                }
            );
            throw error;
        }
    }

    handleError(error) {
        console.error('Original error:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            throw ApiError.validationError('Validation failed', messages);
        }

        if (error.name === 'CastError') {
            throw ApiError.badRequest('Invalid ID format');
        }

        if (error instanceof ApiError) {
            throw error;
        }

        // Handle network/fetch errors
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw ApiError.badRequest('Unable to reach the Swagger URL. Please check the URL and try again.');
        }

        if (error.message?.includes('Invalid Swagger')) {
            throw ApiError.badRequest(error.message);
        }

        throw ApiError.internal('An error occurred while processing the Swagger integration');
    }
}

export { SwaggerIntegrationService };