import { Integration } from '../models/integration.model.js';
import { ApiError } from '../utils/ApiError.js';
import { encryptApiKey, decryptApiKey } from '../utils/postman/apiKeyEncryption.js';
import RawRequest from '../models/rawRequest.model.js';
import RawEnvironment from '../models/rawEnvironment.model.js';
import { mqbroker } from './rabbitmq.service.js';
import integrations_data from '../config/integrations.json' with { type: 'json' };
import { APPLICATION_EXCHANGE_NAME, INTEGRATION_EVENT_ROUTING_KEYS } from "../config/constants.js"


export class IntegrationService {

    static createIntegration = async (orgId, { type, name, description, config }) => {
        const integrationData = integrations_data.integrations.find(integration => integration.type === type);

        if (!integrationData) {
            throw ApiError.badRequest('Invalid integration type');
        }

        const integrationConfig = {};

        if (config.api_key) {
            integrationConfig.api_key = await encryptApiKey(config.api_key);
        }

        if (config.domain) {
            integrationConfig.url = config.domain;
        }

        if (config.url) {
            integrationConfig.url = config.url;
        }

        // Create integration with user info
        const integration = await Integration.create({
            orgId,
            ...integrationData,
            name,
            description,
            config: integrationConfig
        });

        // full integration object
        const full_integration = await Integration.findOne({ _id: integration._id, orgId }).select("+config").lean();

        // decrypt the config
        if (full_integration.config.api_key) {
            full_integration.config.api_key = await decryptApiKey(full_integration.config.api_key);
        }

        await mqbroker.publish(APPLICATION_EXCHANGE_NAME, INTEGRATION_EVENT_ROUTING_KEYS.INSTALL_INTEGRATION, { integration: full_integration });

        return integration;
    }

    static getIntegrations = async (orgId, { filters }) => {

        let integrations = await Integration.find({ orgId })
            .sort({ createdAt: -1 })
            .lean();


        // add installation status, enrich
        integrations = integrations_data.integrations.map(i => {
            const integrationData = integrations.find(integration => integration.type === i.type) || {};

            return {
                ...i,
                ...integrationData,
            }
        });

        if (filters.installed == 'true') {
            return { integrations: integrations.filter(integration => integration.status == "installed") }
        }

        return { integrations }
    }

    static updateIntegration = async (orgId, { integrationId, updates }) => {
        const integration = await Integration.findOneAndUpdate(
            { _id: integrationId, orgId },
            { $set: updates },
            { new: true }
        );

        if (!integration) {
            throw ApiError.notFound('Integration not found');
        }

        return integration;
    }

    static deleteIntegration = async (orgId, { integrationId }) => {
        const integration = await Integration.findOneAndDelete({
            _id: integrationId,
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


        return { message: 'Integration and associated data deleted successfully' };
    }

    static refreshIntegration = async (orgId, { integrationId }) => {
        const integration = await Integration.findOne({ _id: integrationId, orgId });

        if (!integration) {
            throw ApiError.notFound('Integration not found');
        }

        const full_integration = await Integration.findOneAndUpdate({ _id: integration._id, orgId }, { $set: { status: 'refreshing' } }, { new: true }).select("+config").lean();

        // decrypt the config
        if (full_integration.config.api_key) {
            full_integration.config.api_key = await decryptApiKey(full_integration.config.api_key);
        }

        await mqbroker.publish(APPLICATION_EXCHANGE_NAME, INTEGRATION_EVENT_ROUTING_KEYS.REFRESH_INTEGRATION, { integration: full_integration });

        return { message: 'Integration refreshed successfully' };
    }
}