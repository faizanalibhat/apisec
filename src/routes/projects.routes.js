import express from 'express';
import * as projectsController from '../controllers/projects.controller.js';
import * as validation from '../middleware/validation/projects.validation.js';

const router = express.Router();

// Existing project routes
router.get('/', projectsController.getProjects);
router.post('/', validation.validateCreateProject, projectsController.createProject);
router.get('/:projectId', validation.validateObjectId, projectsController.getProject);
router.patch('/:projectId', validation.validateObjectId, validation.validateUpdateProject, projectsController.updateProject);
router.delete('/:projectId', validation.validateObjectId, projectsController.deleteProject);

// Collection management routes
router.post('/:projectId/collections/add', validation.validateObjectId, validation.validateAddCollection, projectsController.addCollection);
router.post('/:projectId/collections/remove', validation.validateObjectId, validation.validateRemoveCollection, projectsController.removeCollection);

// Browser request routes
router.get('/:projectId/browser-requests', validation.validateObjectId, projectsController.getBrowserRequests);
router.post('/:projectId/browser-requests', validation.validateObjectId, validation.validateCreateBrowserRequest, projectsController.createBrowserRequest);
router.post('/:projectId/browser-requests/bulk', validation.validateObjectId, validation.validateBulkCreateBrowserRequests, projectsController.bulkCreateBrowserRequests);
router.get('/:projectId/browser-requests/:requestId', validation.validateObjectId, projectsController.getBrowserRequest);
router.put('/:projectId/browser-requests/:requestId', validation.validateObjectId, validation.validateUpdateBrowserRequest, projectsController.updateBrowserRequest);
router.delete('/:projectId/browser-requests/:requestId', validation.validateObjectId, projectsController.deleteBrowserRequest);

export default router;