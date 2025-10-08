import Integration from '../models/integration.model.js';
import { ApiError } from '../utils/ApiError.js';
import { encryptApiKey, decryptApiKey } from '../utils/postman/apiKeyEncryption.js';
import { PostmanClient } from '../utils/postman/postmanClient.js';
import { PostmanParser } from '../utils/postman/postmanParser.js';
import { Environment } from '../models/environment.model.js';
import RawRequest from '../models/rawRequest.model.js';

class IntegrationService {
    constructor() {
        this.postmanClient = new PostmanClient();
        this.postmanParser = new PostmanParser();
    }

    async createIntegration(data) {
        try {
            const { apiKey, name, description, workspaceIds, organizationId, environment } = data;

            // Encrypt API key before storing
            const encryptedApiKey = await encryptApiKey(apiKey);

            // Get workspace details from Postman
            const workspaces = await this.postmanClient.getWorkspacesByIds(apiKey, workspaceIds);
            
            if (!workspaces || workspaces.length === 0) {
                throw ApiError.badRequest('No valid workspaces found for the provided IDs');
            }

            const env = await Environment.create({ ...environment });

            // Create integration
            const integration = await Integration.create({
                organizationId,
                environmentId: env._id,
                name,
                description,
                apiKey: encryptedApiKey,
                workspaces: workspaces.map(ws => ({
                    id: ws.id,
                    name: ws.name
                }))
            });

            // Start the sync process
            await this.syncIntegration(integration, apiKey, environment);

            // Return integration without sensitive data
            const integrationData = integration.toObject();

            delete integrationData.apiKey;
            
            return integrationData;
        } catch (error) {
            this.handleError(error);
        }
    }

    async getIntegrations(organizationId, page, limit) {
        try {
            const skip = (page - 1) * limit;

            const [integrations, totalItems] = await Promise.all([
                Integration.find({ organizationId })
                    .select('-apiKey')
                    .skip(skip)
                    .limit(limit)
                    .sort({ createdAt: -1 })
                    .lean(),
                Integration.countDocuments({ organizationId })
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

    async getIntegration(id, organizationId) {
        try {
            const integration = await Integration.findOne({ 
                _id: id, 
                organizationId 
            }).select('-apiKey').lean();

            if (!integration) {
                throw ApiError.notFound('Integration not found');
            }

            return integration;
        } catch (error) {
            this.handleError(error);
        }
    }

    async updateIntegration(id, organizationId, updateData) {
        try {
            const { name, description } = updateData;

            const integration = await Integration.findOneAndUpdate(
                { _id: id, organizationId },
                { 
                    $set: {
                        ...(name && { name }),
                        ...(description !== undefined && { description })
                    }
                },
                { new: true, runValidators: true }
            ).select('-apiKey');

            if (!integration) {
                throw ApiError.notFound('Integration not found');
            }

            return integration;
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteIntegration(id, organizationId) {
        try {
            const integration = await Integration.findOne({ 
                _id: id, 
                organizationId 
            });

            if (!integration) {
                throw ApiError.notFound('Integration not found');
            }

            // Delete all raw requests associated with this integration
            await RawRequest.deleteMany({ 
                integrationId: integration._id,
                organizationId 
            });

            // Delete the integration
            await integration.deleteOne();

            return { message: 'Integration and associated requests deleted successfully' };
        } catch (error) {
            this.handleError(error);
        }
    }

    async refreshIntegration(id, organizationId) {
        try {
            const integration = await Integration.findOne({ 
                _id: id, 
                organizationId 
            });

            if (!integration) {
                throw ApiError.notFound('Integration not found');
            }

            // Decrypt API key
            const apiKey = await decryptApiKey(integration.apiKey);

            // Delete existing raw requests for this integration
            await RawRequest.deleteMany({ 
                integrationId: integration._id,
                organizationId 
            });

            // Sync again
            await this.syncIntegration(integration, apiKey);

            // Return updated integration without sensitive data
            const updatedIntegration = await Integration.findById(id).select('-apiKey').lean();
            return updatedIntegration;
        } catch (error) {
            this.handleError(error);
        }
    }

    async getWorkspaces(apiKey) {
        try {
            const workspaces = await this.postmanClient.getAllWorkspaces(apiKey);
            
            if (!workspaces || workspaces.length === 0) {
                throw ApiError.badRequest('No workspaces found for this API key');
            }

            return workspaces.map(ws => ({
                id: ws.id,
                name: ws.name,
                type: ws.type
            }));
        } catch (error) {
            this.handleError(error);
        }
    }

    async syncIntegration(integration, apiKey, environment = {}) {
        try {
            // Update status to syncing
            await integration.updateSyncStatus('syncing');

            let totalRequests = 0;
            let totalCollections = 0;

            // For each workspace
            for (const workspace of integration.workspaces) {
                // Get collections from workspace
                const collections = await this.postmanClient.getCollectionsFromWorkspace(
                    apiKey, 
                    workspace.id
                );

                totalCollections += collections.length;

                // For each collection
                for (const collection of collections) {
                    // Get collection details
                    const collectionDetail = await this.postmanClient.getCollectionDetail(
                        apiKey,
                        collection.uid
                    );

                    // Parse collection into raw requests
                    const rawRequests = await this.postmanParser.parseCollection(
                        collectionDetail,
                        {
                            organizationId: integration.organizationId,
                            integrationId: integration._id,
                            workspaceName: workspace.name,
                            collectionName: collection.name,
                            collectionId: collection.uid,
                            envs: environment
                        }
                    );

                    // Save raw requests
                    if (rawRequests && rawRequests.length > 0) {
                        await RawRequest.insertMany(rawRequests);
                        totalRequests += rawRequests.length;
                    }

                    // For now, just count
                    totalRequests += rawRequests?.length || 0;
                }
            }

            // Update integration metadata
            await integration.updateSyncMetadata(totalRequests, totalCollections);
            await integration.updateSyncStatus('completed');

        } catch (error) {
            // Update integration with error status
            await integration.updateSyncStatus('failed', error.message);
            throw error;
        }
    }

    handleError(error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            throw ApiError.validationError('Validation failed', messages);
        }

        if (error.name === 'CastError') {
            throw ApiError.badRequest('Invalid ID format');
        }

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            throw ApiError.conflict(`An integration with this ${field} already exists`);
        }

        if (error instanceof ApiError) {
            throw error;
        }

        // Handle Postman API errors
        if (error.response) {
            if (error.response.status === 401) {
                throw ApiError.unauthorized('Invalid Postman API key');
            }
            if (error.response.status === 429) {
                throw ApiError.tooManyRequests('Postman API rate limit exceeded. Please try again later');
            }
            if (error.response.status === 404) {
                throw ApiError.notFound('Postman resource not found');
            }
        }

        throw ApiError.internal('An error occurred while processing the integration');
    }
}

export { IntegrationService };