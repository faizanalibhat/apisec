import { SwaggerIntegrationService } from '../services/swagger-integration.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

class SwaggerIntegrationController {
    constructor() {
        this.service = new SwaggerIntegrationService();
        
        // Bind all methods
        this.createIntegration = this.createIntegration.bind(this);
        this.getIntegrations = this.getIntegrations.bind(this);
        this.getIntegration = this.getIntegration.bind(this);
        this.updateIntegration = this.updateIntegration.bind(this);
        this.deleteIntegration = this.deleteIntegration.bind(this);
        this.refreshIntegration = this.refreshIntegration.bind(this);
        this.validateUrl = this.validateUrl.bind(this);
    }

    async createIntegration(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { sourceUrl, name, description } = req.body;

            const result = await this.service.createIntegration({
                sourceUrl,
                name,
                description,
                orgId
            });

            res.sendApiResponse(ApiResponse.created('Swagger integration created successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async getIntegrations(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { page = 1, limit = 10, search = '' } = req.query;

            const result = await this.service.getIntegrations(
                orgId,
                parseInt(page),
                parseInt(limit),
                search
            );

            res.sendApiResponse(
                ApiResponse.paginated(
                    'Swagger integrations retrieved successfully',
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

            res.sendApiResponse(ApiResponse.success('Swagger integration retrieved successfully', result));
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

            res.sendApiResponse(ApiResponse.success('Swagger integration updated successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async deleteIntegration(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;

            await this.service.deleteIntegration(id, orgId);

            res.sendApiResponse(ApiResponse.success('Swagger integration deleted successfully'));
        } catch (error) {
            next(error);
        }
    }

    async refreshIntegration(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;

            const result = await this.service.refreshIntegration(id, orgId);

            res.sendApiResponse(ApiResponse.success('Swagger integration refreshed successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async validateUrl(req, res, next) {
        try {
            const { sourceUrl } = req.body;

            const result = await this.service.validateSwaggerUrl(sourceUrl);

            res.sendApiResponse(ApiResponse.success('Swagger URL is valid', result));
        } catch (error) {
            next(error);
        }
    }
}

const controller = new SwaggerIntegrationController();
export const {
    createIntegration,
    getIntegrations,
    getIntegration,
    updateIntegration,
    deleteIntegration,
    refreshIntegration,
    validateUrl
} = controller;