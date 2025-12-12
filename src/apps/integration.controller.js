import { IntegrationService } from '../services/integration.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

class IntegrationController {
    constructor() {
        this.service = new IntegrationService();
        
        // Bind all methods
        this.createIntegration = this.createIntegration.bind(this);
        this.getIntegrations = this.getIntegrations.bind(this);
        this.getIntegration = this.getIntegration.bind(this);
        this.updateIntegration = this.updateIntegration.bind(this);
        this.deleteIntegration = this.deleteIntegration.bind(this);
        this.refreshIntegration = this.refreshIntegration.bind(this);
        this.getWorkspaces = this.getWorkspaces.bind(this);
    }

    async createIntegration(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { apiKey, name, description, workspaceIds, environment } = req.body;

            const result = await this.service.createIntegration({
                apiKey,
                name,
                description,
                workspaceIds,
                orgId,
                environment
            });

            res.sendApiResponse(ApiResponse.created('Integration created successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async getIntegrations(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { page = 1, limit = 10 } = req.query;

            const result = await this.service.getIntegrations(
                orgId,
                parseInt(page),
                parseInt(limit)
            );

            res.sendApiResponse(
                ApiResponse.paginated(
                    'Integrations retrieved successfully',
                    result.integrations,
                    {
                        currentPage: result.currentPage,
                        totalPages: result.totalPages,
                        totalItems: result.totalItems,
                        itemsPerPage: result.itemsPerPage
                    }
                )
            );
        } catch (error) {
            next(error);
        }
    }

    async getIntegration(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;

            const result = await this.service.getIntegration(id, orgId);

            res.sendApiResponse(ApiResponse.success('Integration retrieved successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async updateIntegration(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;
            const { name, description } = req.body;

            const result = await this.service.updateIntegration(id, orgId, {
                name,
                description
            });

            res.sendApiResponse(ApiResponse.success('Integration updated successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async deleteIntegration(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;

            await this.service.deleteIntegration(id, orgId);

            res.sendApiResponse(ApiResponse.success('Integration deleted successfully'));
        } catch (error) {
            next(error);
        }
    }

    async refreshIntegration(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;

            const result = await this.service.refreshIntegration(id, orgId);

            res.sendApiResponse(ApiResponse.success('Integration refreshed successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async getWorkspaces(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { apiKey } = req.body;

            const workspaces = await this.service.getWorkspaces(apiKey);

            res.sendApiResponse(ApiResponse.success('Workspaces retrieved successfully', workspaces));
        } catch (error) {
            next(error);
        }
    }
}

const controller = new IntegrationController();
export const {
    createIntegration,
    getIntegrations,
    getIntegration,
    updateIntegration,
    deleteIntegration,
    refreshIntegration,
    getWorkspaces
} = controller;