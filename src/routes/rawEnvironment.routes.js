import express from 'express';
import * as rawEnvironmentController from '../controllers/rawEnvironment.controller.js';

const router = express.Router();

// Search route (must be before /:id)
router.get('/search', rawEnvironmentController.search);

// Bulk operations
router.post('/bulk/delete', rawEnvironmentController.bulkDelete);

// Get environments by workspace
router.get('/workspace/:workspaceId', rawEnvironmentController.getByWorkspace);

// Standard CRUD routes
router
    .post('/', rawEnvironmentController.create)
    .get('/', rawEnvironmentController.getAll);

router
    .get('/:id', rawEnvironmentController.getOne)
    .put('/:id', rawEnvironmentController.update)
    .delete('/:id', rawEnvironmentController.deleteEnvironment);

export default router;