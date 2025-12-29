import Integration from '../models/integration.model.js';
import { ApiError } from '../utils/ApiError.js';
import { encryptApiKey, decryptApiKey } from '../utils/postman/apiKeyEncryption.js';
import { PostmanClient } from '../utils/postman/postmanClient.js';
import { PostmanParser } from '../utils/postman/postmanParser.js';
import { Environment } from '../models/environment.model.js';
import RawRequest from '../models/rawRequest.model.js';
import RawEnvironment from '../models/rawEnvironment.model.js';
import { mqbroker } from './rabbitmq.service.js';
import { PostmanCollections } from '../models/postman-collections.model.js';

class IntegrationService {
    constructor() {
        this.postmanClient = new PostmanClient();
        this.postmanParser = new PostmanParser();
    }

    async createIntegration(data) {
        try {
            const { apiKey, name, description, workspaceIds, orgId, environment } = data;

            // Encrypt API key before storing
            const encryptedApiKey = await encryptApiKey(apiKey);

            // Get user info from Postman
            const userInfo = await this.postmanClient.getUserInfo(apiKey);

            // Get workspace details from Postman
            const workspaces = await this.postmanClient.getWorkspacesByIds(apiKey, workspaceIds);

            if (!workspaces || workspaces.length === 0) {
                throw ApiError.badRequest('No valid workspaces found for the provided IDs');
            }

            const env = await Environment.create({ ...environment });

            // Create integration with user info
            const integration = await Integration.create({
                orgId,
                environmentId: env._id,
                name,
                description,
                apiKey: encryptedApiKey,
                postmanUserId: userInfo.userId.toString(),
                postmanTeamDomain: userInfo.teamDomain,
                workspaces: workspaces.map(ws => ({
                    id: ws.id,
                    name: ws.name,
                    collections: [] // Will be populated during sync
                }))
            });

            // Start the sync process
            // await this.syncIntegration(integration, apiKey, environment);
            await mqbroker.publish("apisec", "apisec.integration.sync", { integration, apiKey, environment });

            // Return integration without sensitive data
            const integrationData = integration.toObject();

            delete integrationData.apiKey;

            return integrationData;
        } catch (error) {
            this.handleError(error);
        }
    }

    async getIntegrations(orgId, page, limit) {
        try {
            const skip = (page - 1) * limit;

            const [integrations, totalItems] = await Promise.all([
                Integration.find({ orgId })
                    .select('-apiKey')
                    .skip(skip)
                    .limit(limit)
                    .sort({ createdAt: -1 })
                    .lean(),
                Integration.countDocuments({ orgId })
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
                orgId
            }).select('-apiKey').lean();

            if (!integration) {
                throw ApiError.notFound('Integration not found');
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
                { _id: id, orgId },
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

    async deleteIntegration(id, orgId) {
        try {
            const integration = await Integration.findOne({
                _id: id,
                orgId
            });

            if (!integration) {
                throw ApiError.notFound('Integration not found');
            }

            // Delete all raw requests associated with this integration
            await RawRequest.deleteMany({
                integrationId: integration._id,
                orgId
            });

            // Delete all raw environments associated with this integration
            await RawEnvironment.deleteMany({
                integrationId: integration._id,
                orgId
            });

            // Delete all collections associated with this integration
            await PostmanCollections.deleteMany({
                integrationId: integration._id,
                orgId
            });

            // Delete the integration
            await integration.deleteOne();

            return { message: 'Integration and associated data deleted successfully' };
        } catch (error) {
            this.handleError(error);
        }
    }

    async refreshIntegration(id, orgId) {
        try {
            const integration = await Integration.findOne({
                _id: id,
                orgId
            });

            if (!integration) {
                throw ApiError.notFound('Integration not found');
            }

            // Decrypt API key
            const apiKey = await decryptApiKey(integration.apiKey);

            // Delete existing raw requests for this integration
            await RawRequest.deleteMany({
                integrationId: integration._id,
                orgId
            });

            // Delete existing raw environments for this integration
            await RawEnvironment.deleteMany({
                integrationId: integration._id,
                orgId
            });

            // Clear existing collections from workspaces
            integration.workspaces.forEach(workspace => {
                workspace.collections = [];
            });

            await integration.save();

            // Sync again
            // await this.syncIntegration(integration, apiKey);
            // await this.syncIntegration(integration, apiKey, environment);
            await mqbroker.publish("apisec", "apisec.integration.sync", { integration, apiKey, environment: {} });

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
            await Integration.updateOne({ _id: integration._id }, { $set: { status: 'syncing' } });
            // await integration.updateSyncStatus('syncing');

            let totalRequests = 0;
            let totalCollections = 0;
            const workspaceUpdates = [];
            // used to store collections objects that will be put in mongodb
            const collectionsToCreate = [];

            // For each workspace
            for (const workspace of integration.workspaces) {
                const workspaceCollections = [];
                const workspaceEnvironments = [];

                // Get collections from workspace
                const collections = await this.postmanClient.getCollectionsFromWorkspace(
                    apiKey,
                    workspace.id
                );

                // Get environments from workspace
                const environments = await this.postmanClient.getEnvironmentsFromWorkspace(
                    apiKey,
                    workspace.id
                );

                // Process environments
                for (const env of environments) {
                    try {
                        // Get full environment details
                        const envDetail = await this.postmanClient.getEnvironmentDetail(
                            apiKey,
                            env.uid
                        );

                        if (envDetail) {
                            // Create raw environment
                            const rawEnvData = {
                                orgId: integration.orgId,
                                integrationId: integration._id,
                                workspaceId: workspace.id,
                                workspaceName: workspace.name,
                                postmanEnvironmentId: envDetail.id,
                                postmanUid: envDetail.uid,
                                name: envDetail.name,
                                owner: envDetail.owner,
                                values: envDetail.values || [],
                                isPublic: envDetail.isPublic || false,
                                postmanCreatedAt: envDetail.createdAt ? new Date(envDetail.createdAt) : null,
                                postmanUpdatedAt: envDetail.updatedAt ? new Date(envDetail.updatedAt) : null,
                            };

                            // Generate Postman URL
                            rawEnvData.postmanUrl = `https://${integration.postmanTeamDomain}.postman.co/workspace/${encodeURIComponent(workspace.name)}~${workspace.id}/environment/${integration.postmanUserId}-${envDetail.uid}`;

                            // Upsert the environment
                            await RawEnvironment.findOneAndUpdate(
                                {
                                    postmanEnvironmentId: envDetail.id,
                                    orgId: integration.orgId
                                },
                                rawEnvData,
                                { upsert: true, new: true }
                            );

                            workspaceEnvironments.push({
                                id: envDetail.id,
                                uid: envDetail.uid,
                                name: envDetail.name
                            });
                        }
                    } catch (envError) {
                        console.error(`Error processing environment ${env.uid}:`, envError.message);
                        // Continue processing other environments
                    }
                }

                totalCollections += collections.length;

                // For each collection
                for (const collection of collections) {
                    // Get collection details
                    const collectionDetail = await this.postmanClient.getCollectionDetail(
                        apiKey,
                        collection.uid
                    );

                    // Generate Postman URL for this collection
                    const postmanUrl = this.generatePostmanUrl(
                        integration,
                        workspace.name,
                        workspace.id,
                        collection.id // use short numeric collection id for collection-level URL
                    );

                    // Add to workspace collections
                    workspaceCollections.push({
                        id: collection.id,
                        uid: collection.uid,
                        collectionId: collection.id,
                        collectionUid: collection.uid,
                        name: collection.name,
                        postmanUrl: postmanUrl
                    });

                    PostmanCollections.bulkWrite([{
                        updateOne: {
                            filter: { orgId: integration.orgId, collectionUid: collection.uid },
                            update: {
                                $setOnInsert: {
                                    orgId: integration.orgId,
                                    name: collection.name,
                                    collectionUid: collection.uid,
                                    collectionId: collection.id,
                                    postmanUrl: postmanUrl,
                                    workspaceId: workspace.id
                                }
                            },
                            upsert: true
                        }
                    }]);

                    // Parse collection into raw requests
                    const rawRequests = await this.postmanParser.parseCollection(
                        collectionDetail,
                        {
                            orgId: integration.orgId,
                            integrationId: integration._id,
                            workspaceName: workspace.name,
                            collectionName: collection.name,
                            collectionId: collection.id,
                            collectionUid: collection.uid,
                            workspaceId: workspace.id,
                            envs: environment
                        }
                    );

                    // Save raw requests
                    if (rawRequests && rawRequests.length > 0) {
                        await RawRequest.insertMany(rawRequests);
                        totalRequests += rawRequests.length;
                    }
                }

                // Update workspace with collections
                workspaceUpdates.push({
                    workspaceId: workspace.id,
                    collections: workspaceCollections
                });
            }

            // Update all workspace collections
            for (const update of workspaceUpdates) {
                const workspaceIndex = integration.workspaces.findIndex(ws => ws.id === update.workspaceId);
                if (workspaceIndex !== -1) {
                    integration.workspaces[workspaceIndex].collections = update.collections;
                }
            }

            // Save the integration with all updates
            integration.metadata.totalRequests = totalRequests;
            integration.metadata.totalCollections = totalCollections;

            integration.metadata.status = 'completed';

            await Integration.updateOne({ _id: integration._id }, { $set: integration } );

            // save all the collections as well.
            // await PostmanCollections.bulkWrite(collectionsToCreate);
        } catch (error) {
            // Update integration with error status
            integration.metadata.status = 'failed';
            await Integration.updateOne({ _id: integration._id }, { $set: integration } );
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

    generatePostmanUrl(integration, workspaceName, workspaceId, collectionUid) {
        // Safe guard - require team domain and user id to build URLs
        if (!integration || !integration.postmanTeamDomain || !integration.postmanUserId) {
            return null;
        }

        // Collection-level URL (can be extended to request-level later)
        return `https://${integration.postmanTeamDomain}.postman.co/workspace/${encodeURIComponent(workspaceName)}~${workspaceId}/collection/${integration.postmanUserId}-${collectionUid}`;
    }
}


export { IntegrationService };