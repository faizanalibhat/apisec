import express from 'express';
import * as controller from '../controllers/integration.controller.js';
import IntegrationValidator from '../middleware/integrationValidator.js';

const router = express.Router();

// Create new integration
router.post('/', 
    // IntegrationValidator.validateCreate,
    controller.createIntegration
);

// Get all integrations (with pagination validation)
router.get('/', 
    // IntegrationValidator.validatePagination,
    controller.getIntegrations
);

// Get single integration
router.get('/:id', 
    // IntegrationValidator.validateId,
    controller.getIntegration
);

// Update integration (mainly for metadata like name, description)
router.put('/:id', 
    // IntegrationValidator.validateId,
    // IntegrationValidator.validateUpdate,
    controller.updateIntegration
);

// Delete integration and all associated raw_requests
router.delete('/:id', 
    // IntegrationValidator.validateId,
    controller.deleteIntegration
);

// Refresh integration (re-sync from Postman)
router.post('/:id/refresh', 
    // IntegrationValidator.validateId,
    controller.refreshIntegration
);

// Get available workspaces for an API key
router.post('/workspaces', 
    // IntegrationValidator.validateGetWorkspaces,
    controller.getWorkspaces
);

export default router;
