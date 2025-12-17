import express from 'express';
import * as rawEnvironmentController from '../../controllers/rawEnvironment.controller.js';

const router = express.Router();

// Bulk operations
router.post('/bulk/delete', rawEnvironmentController.bulkDelete);

// Get environments by workspace
router.get('/workspace/:workspaceId', rawEnvironmentController.getByWorkspace);

// Variable-specific routes (must be before standard CRUD /:id routes)
router.post('/:id/variables', rawEnvironmentController.addVariable);
router.put('/:id/variables/:key', rawEnvironmentController.updateVariable);
router.delete('/:id/variables/:key', rawEnvironmentController.deleteVariable);

// Standard CRUD routes
router
    .post('/', rawEnvironmentController.create)
    .get('/', rawEnvironmentController.getAll);

router
    .get('/:id', rawEnvironmentController.getOne)
    .put('/:id', rawEnvironmentController.update)
    .delete('/:id', rawEnvironmentController.deleteEnvironment);

export default router;