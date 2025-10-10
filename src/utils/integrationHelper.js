import { ApiError } from './ApiError.js';

class IntegrationHelper {
    /**
     * Format Postman API error messages for better user experience
     */
    static formatPostmanError(error) {
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.error?.message || error.response.data?.message;

            switch (status) {
                case 401:
                    return 'Invalid Postman API key. Please check your API key and try again.';
                case 403:
                    return 'Access forbidden. Please ensure your API key has the necessary permissions.';
                case 404:
                    return 'The requested Postman resource was not found.';
                case 429:
                    return 'Postman API rate limit exceeded. Please try again in a few minutes.';
                case 500:
                case 502:
                case 503:
                    return 'Postman service is temporarily unavailable. Please try again later.';
                default:
                    return message || `Postman API error: ${status}`;
            }
        }

        if (error.code) {
            switch (error.code) {
                case 'ECONNREFUSED':
                    return 'Unable to connect to Postman API. Please check your internet connection.';
                case 'ETIMEDOUT':
                    return 'Request to Postman API timed out. Please try again.';
                case 'ENOTFOUND':
                    return 'Unable to reach Postman API. Please check your internet connection.';
                default:
                    return `Network error: ${error.code}`;
            }
        }

        return error.message || 'An unexpected error occurred while connecting to Postman';
    }

    /**
     * Build integration summary for response
     */
    static buildIntegrationSummary(integration, additionalInfo = {}) {
        const summary = {
            id: integration._id,
            name: integration.name,
            description: integration.description,
            status: integration.metadata.status,
            lastSyncedAt: integration.metadata.lastSyncedAt,
            statistics: {
                totalRequests: integration.metadata.totalRequests,
                totalCollections: integration.metadata.totalCollections,
                workspaces: integration.workspaces.length
            },
            ...additionalInfo
        };

        // Add sync status message
        if (integration.metadata.status === 'completed') {
            summary.message = `Successfully imported ${summary.statistics.totalRequests} requests from ${summary.statistics.totalCollections} collections`;
        } else if (integration.metadata.status === 'failed') {
            summary.message = integration.metadata.lastError || 'Integration sync failed';
        } else if (integration.metadata.status === 'syncing') {
            summary.message = 'Integration sync in progress...';
        }

        return summary;
    }

    /**
     * Check if an API key already exists for the organization
     */
    static async checkDuplicateApiKey(Integration, apiKey, orgId, excludeId = null) {
        // This would require decrypting all API keys to check, which is expensive
        // For MVP, we'll skip this check and rely on unique integration names
        // In production, consider storing a hashed version of API keys for comparison
        return false;
    }

    /**
     * Calculate sync statistics from raw requests
     */
    static calculateSyncStats(rawRequests) {
        const stats = {
            totalRequests: rawRequests.length,
            byMethod: {},
            byFolder: {},
            byCollection: {},
            authTypes: new Set()
        };

        rawRequests.forEach(request => {
            // Count by method
            stats.byMethod[request.method] = (stats.byMethod[request.method] || 0) + 1;

            // Count by folder
            const folder = request.folder_name || 'Root';
            stats.byFolder[folder] = (stats.byFolder[folder] || 0) + 1;

            // Count by collection
            const collection = request.collection_info?.name || 'Unknown';
            stats.byCollection[collection] = (stats.byCollection[collection] || 0) + 1;

            // Track auth types
            if (request.auth?.type) {
                stats.authTypes.add(request.auth.type);
            }
        });

        stats.authTypes = Array.from(stats.authTypes);
        return stats;
    }

    /**
     * Format workspace data for response
     */
    static formatWorkspaceData(workspaces) {
        return workspaces.map(workspace => ({
            id: workspace.id,
            name: workspace.name,
            type: workspace.type || 'personal'
        }));
    }

    /**
     * Validate workspace access
     */
    static validateWorkspaceAccess(selectedWorkspaceIds, availableWorkspaces) {
        const availableIds = availableWorkspaces.map(ws => ws.id);
        const invalidIds = selectedWorkspaceIds.filter(id => !availableIds.includes(id));

        if (invalidIds.length > 0) {
            throw ApiError.badRequest(`Invalid workspace IDs: ${invalidIds.join(', ')}`);
        }

        return true;
    }

    /**
     * Create a sanitized integration object for response
     */
    static sanitizeIntegration(integration) {
        const sanitized = integration.toObject ? integration.toObject() : { ...integration };
        delete sanitized.apiKey;
        return sanitized;
    }

    /**
     * Build import progress message
     */
    static buildProgressMessage(current, total, type = 'collections') {
        return `Processing ${type}: ${current}/${total} (${Math.round((current / total) * 100)}% complete)`;
    }

    /**
     * Estimate sync duration based on request count
     */
    static estimateSyncDuration(totalCollections) {
        // Rough estimate: 2 seconds per collection (includes API calls and DB operations)
        const estimatedSeconds = totalCollections * 2;
        
        if (estimatedSeconds < 60) {
            return `${estimatedSeconds} seconds`;
        } else if (estimatedSeconds < 3600) {
            return `${Math.round(estimatedSeconds / 60)} minutes`;
        } else {
            return `${Math.round(estimatedSeconds / 3600)} hours`;
        }
    }

    /**
     * Generate integration report
     */
    static generateIntegrationReport(integration, rawRequests) {
        const stats = this.calculateSyncStats(rawRequests);
        
        return {
            integration: this.sanitizeIntegration(integration),
            summary: {
                totalRequests: stats.totalRequests,
                requestsByMethod: stats.byMethod,
                collections: Object.keys(stats.byCollection).length,
                folders: Object.keys(stats.byFolder).length,
                authTypes: stats.authTypes
            },
            topCollections: Object.entries(stats.byCollection)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, requestCount: count })),
            importedAt: new Date()
        };
    }
}

export default IntegrationHelper;