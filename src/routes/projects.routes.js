import express from 'express';
import * as projectsController from '../controllers/projects.controller.js';
import * as validation from '../middleware/validation/projects.validation.js';

const router = express.Router();

// Existing project routes
router.get('/', projectsController.getProjects);
router.post('/', projectsController.createProject);
router.get('/:projectId', projectsController.getProject);
router.patch('/:projectId', projectsController.updateProject);
router.delete('/:projectId', projectsController.deleteProject);

// Collection management routes
router.post('/:projectId/collections/add', projectsController.addCollection);
router.post('/:projectId/collections/remove', projectsController.removeCollection);

// Rule management routes
router.get('/:projectId/rules', projectsController.getProjectRules);
router.get('/:projectId/rules/effective', projectsController.getEffectiveRules);
router.put('/:projectId/rules', projectsController.updateProjectRules);

// Browser request routes
router.get('/:projectId/browser-requests', projectsController.getBrowserRequests);
router.post('/:projectId/browser-requests', projectsController.createBrowserRequest);
router.post('/:projectId/browser-requests/bulk', projectsController.bulkCreateBrowserRequests);
router.get('/:projectId/browser-requests/:requestId', projectsController.getBrowserRequest);
router.put('/:projectId/browser-requests/:requestId', projectsController.updateBrowserRequest);
router.delete('/:projectId/browser-requests/:requestId', projectsController.deleteBrowserRequest);

export default router;

/*

With validation

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

// Rule management routes
router.get('/:projectId/rules', validation.validateObjectId, projectsController.getProjectRules);
router.get('/:projectId/rules/effective', validation.validateObjectId, projectsController.getEffectiveRules);
router.put('/:projectId/rules', validation.validateObjectId, validation.validateUpdateRules, projectsController.updateProjectRules);

// Browser request routes
router.get('/:projectId/browser-requests', validation.validateObjectId, projectsController.getBrowserRequests);
router.post('/:projectId/browser-requests', validation.validateObjectId, validation.validateCreateBrowserRequest, projectsController.createBrowserRequest);
router.post('/:projectId/browser-requests/bulk', validation.validateObjectId, validation.validateBulkCreateBrowserRequests, projectsController.bulkCreateBrowserRequests);
router.get('/:projectId/browser-requests/:requestId', validation.validateObjectId, projectsController.getBrowserRequest);
router.put('/:projectId/browser-requests/:requestId', validation.validateObjectId, validation.validateUpdateBrowserRequest, projectsController.updateBrowserRequest);
router.delete('/:projectId/browser-requests/:requestId', validation.validateObjectId, projectsController.deleteBrowserRequest);

export default router;

*/