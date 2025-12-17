import express from 'express';
import * as controller from '../../controllers/integration-controller/swagger-integration.controller.js';
import SwaggerIntegrationValidator from '../../middleware/swaggerIntegrationValidator.js';

const router = express.Router();

// Create new swagger integration
router.post('/', 
    // SwaggerIntegrationValidator.validateCreate,
    controller.createIntegration
);

// Get all swagger integrations (with pagination validation)
router.get('/', 
    // SwaggerIntegrationValidator.validatePagination,
    controller.getIntegrations
);

// Get single swagger integration
router.get('/:id', 
    // SwaggerIntegrationValidator.validateId,
    controller.getIntegration
);

// Update swagger integration (mainly for metadata like name, description)
router.put('/:id', 
    // SwaggerIntegrationValidator.validateId,
    // SwaggerIntegrationValidator.validateUpdate,
    controller.updateIntegration
);

// Delete swagger integration and all associated raw_requests
router.delete('/:id', 
    // SwaggerIntegrationValidator.validateId,
    controller.deleteIntegration
);

// Refresh swagger integration (re-sync from source URL)
router.post('/:id/refresh', 
    // SwaggerIntegrationValidator.validateId,
    controller.refreshIntegration
);

// Validate a Swagger URL before creating integration
router.post('/validate-url', 
    // SwaggerIntegrationValidator.validateUrl,
    controller.validateUrl
);

export default router;