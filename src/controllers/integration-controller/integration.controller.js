import { IntegrationService } from '../../services/integration.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { catchError } from '../../utils/catch-error.js';



export class IntegrationController {

    static createIntegration = catchError(async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { type } = req.params;
        const { name, config } = req.body;

        const integration = await IntegrationService.createIntegration(orgId, { type, name, config });

        res.sendApiResponse(ApiResponse.created('Integration created successfully', integration));
    })

    static getIntegrations = catchError(async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { installed } = req.query;

        const filters = { installed };

        const result = await IntegrationService.getIntegrations(orgId, { filters });

        res.sendApiResponse(
            ApiResponse.paginated(
                'Integrations retrieved successfully',
                result.integrations,
            )
        );
    })

    static updateIntegration = catchError(async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { integrationId } = req.params;

        const { updates } = req.body;

        const result = await IntegrationService.updateIntegration(orgId, { integrationId, updates });

        res.sendApiResponse(ApiResponse.success('Integration updated successfully', result));
    })

    static deleteIntegration = catchError(async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { integrationId } = req.params;

        await IntegrationService.deleteIntegration(orgId, { integrationId });

        res.sendApiResponse(ApiResponse.success('Integration deleted successfully'));
    })

    static refreshIntegration = catchError(async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { integrationId } = req.params;

        const result = await IntegrationService.refreshIntegration(orgId, { integrationId });

        res.sendApiResponse(ApiResponse.success('Integration refreshed successfully', result));
    })
}