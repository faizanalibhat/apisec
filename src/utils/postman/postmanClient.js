import axios from 'axios';
import { ApiError } from '../ApiError.js';

// Constants
const POSTMAN_API_BASE = 'https://api.getpostman.com';
const NETWORK_ERRORS = [
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNRESET',
    'EHOSTUNREACH',
    'EPIPE'
];

const BASE_CONFIG = {
    timeout: 30000,
    validateStatus: status => status < 500
};

class PostmanClient {
    constructor() {
        this.baseConfig = BASE_CONFIG;
    }

    // Utility: Sleep function for delays
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Make rate-limited request with retry logic
    async makeRequest(requestFn, maxRetries = 3) {
        let attempt = 0;
        const baseDelay = 1000;
        let lastError = null;

        while (attempt < maxRetries) {
            try {
                return await requestFn();
            } catch (error) {
                attempt++;
                lastError = error;
                let retryAfter;

                if (error.response?.status === 429) {
                    // Handle rate limit
                    try {
                        const match = error.response.data.message.match(/retry after (\d+)/);
                        retryAfter = match ? parseInt(match[1]) - Date.now() : baseDelay * Math.pow(2, attempt);
                        if (retryAfter < 0) retryAfter = baseDelay * Math.pow(2, attempt);
                    } catch (e) {
                        retryAfter = baseDelay * Math.pow(2, attempt);
                    }
                } else if (NETWORK_ERRORS.includes(error.code)) {
                    console.warn(`Network error (${error.code}) on attempt ${attempt}/${maxRetries}. Retrying...`);
                    retryAfter = baseDelay * Math.pow(2, attempt);
                } else {
                    throw error;
                }

                retryAfter = Math.min(retryAfter || baseDelay * Math.pow(2, attempt), 60000);
                console.log(`Request failed. Retrying after ${retryAfter}ms (Attempt ${attempt}/${maxRetries})`);
                await this.sleep(retryAfter);
                continue;
            }
        }

        // Handle final error
        if (NETWORK_ERRORS.includes(lastError.code)) {
            throw ApiError.serviceUnavailable(`Network error after ${maxRetries} attempts`);
        } else if (lastError.response?.status === 429) {
            throw ApiError.tooManyRequests('Postman API rate limit exceeded');
        }

        throw lastError;
    }

    // Get user information
    async getUserInfo(apiKey) {
        const config = {
            ...this.baseConfig,
            headers: { 'X-Api-Key': apiKey }
        };

        const response = await this.makeRequest(() =>
            axios.get(`${POSTMAN_API_BASE}/me`, config)
        );

        if (!response.data?.user) {
            throw ApiError.badRequest('Invalid response from Postman API');
        }

        return {
            userId: response.data.user.id,
            teamDomain: response.data.user.teamDomain,
            username: response.data.user.username,
            email: response.data.user.email,
            fullName: response.data.user.fullName,
            teamName: response.data.user.teamName
        };
    }

    // Get all workspaces
    async getAllWorkspaces(apiKey) {
        const config = {
            ...this.baseConfig,
            headers: { 'X-Api-Key': apiKey }
        };

        const response = await this.makeRequest(() =>
            axios.get(`${POSTMAN_API_BASE}/workspaces`, config)
        );

        if (!response.data?.workspaces) {
            throw ApiError.badRequest('Invalid response from Postman API');
        }

        return response.data.workspaces;
    }

    // Get specific workspaces by IDs
    async getWorkspacesByIds(apiKey, workspaceIds) {
        const allWorkspaces = await this.getAllWorkspaces(apiKey);

        return allWorkspaces;

        // should support both maybe.
        // return allWorkspaces.filter(ws => workspaceIds.includes(ws.id));
    }

    // Get collections from a specific workspace
    async getCollectionsFromWorkspace(apiKey, workspaceId) {
        const config = {
            ...this.baseConfig,
            headers: { 'X-Api-Key': apiKey }
        };

        const response = await this.makeRequest(() =>
            axios.get(`${POSTMAN_API_BASE}/collections?workspace=${workspaceId}`, config)
        );

        if (!response.data?.collections) {
            return [];
        }

        return response.data.collections;
    }

    // Get collection details
    async getCollectionDetail(apiKey, collectionId) {
        const config = {
            ...this.baseConfig,
            headers: { 'X-Api-Key': apiKey }
        };

        const response = await this.makeRequest(() =>
            axios.get(`${POSTMAN_API_BASE}/collections/${collectionId}`, config)
        );

        if (!response.data?.collection) {
            throw ApiError.notFound('Collection not found');
        }

        return response.data.collection;
    }

    // Get all environments (global)
    async getAllEnvironments(apiKey) {
        const config = {
            ...this.baseConfig,
            headers: { 'X-Api-Key': apiKey }
        };

        const response = await this.makeRequest(() =>
            axios.get(`${POSTMAN_API_BASE}/environments`, config)
        );

        if (!response.data?.environments) {
            return [];
        }

        return response.data.environments;
    }

    // Get environments from a specific workspace
    async getEnvironmentsFromWorkspace(apiKey, workspaceId) {
        const config = {
            ...this.baseConfig,
            headers: { 'X-Api-Key': apiKey }
        };

        const response = await this.makeRequest(() =>
            axios.get(`${POSTMAN_API_BASE}/environments?workspace=${workspaceId}`, config)
        );

        if (!response.data?.environments) {
            return [];
        }

        return response.data.environments;
    }

    // Get environment details
    async getEnvironmentDetail(apiKey, environmentUid) {
        const config = {
            ...this.baseConfig,
            headers: { 'X-Api-Key': apiKey }
        };

        try {
            const response = await this.makeRequest(() =>
                axios.get(`${POSTMAN_API_BASE}/environments/${environmentUid}`, config)
            );

            if (!response.data?.environment) {
                return null;
            }

            return response.data.environment;
        } catch (error) {
            console.warn(`Error fetching environment ${environmentUid}:`, error.message);
            return null;
        }
    }

    // Get environment variables for a workspace (legacy method - keeping for compatibility)
    async getEnvironmentVariables(apiKey, workspaceId) {
        const config = {
            ...this.baseConfig,
            headers: { 'X-Api-Key': apiKey }
        };

        try {
            const response = await this.makeRequest(() =>
                axios.get(`${POSTMAN_API_BASE}/environments?workspace=${workspaceId}`, config)
            );

            if (!response.data?.environments) return {};

            const envVars = {};

            // Fetch each environment's details
            for (const env of response.data.environments) {
                const envDetail = await this.getEnvironmentDetail(apiKey, env.uid);

                if (envDetail?.values) {
                    for (const v of envDetail.values) {
                        if (v.enabled !== false && v.key && v.value) {
                            envVars[v.key] = v.value;
                        }
                    }
                }

                // Add delay to avoid rate limits
                await this.sleep(100);
            }

            return envVars;
        } catch (error) {
            console.warn('Error fetching environment variables:', error.message);
            return {};
        }
    }
}

export { PostmanClient };