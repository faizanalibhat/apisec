import express from 'express';
import { IntegrationController } from '../../controllers/integration-controller/integration.controller.js';

const router = express.Router();

// Create new integration
router.post('/:type', 
    IntegrationController.createIntegration
);

// Get all integrations (with pagination validation)
router.get('/', 
    IntegrationController.getIntegrations
);

// Update integration (mainly for metadata like name, description)
router.put('/:integrationId', 
    IntegrationController.updateIntegration
);

router.delete('/:integrationId', 
    IntegrationController.deleteIntegration
);

router.post('/:integrationId/refresh', 
    IntegrationController.refreshIntegration
);

export default router;
