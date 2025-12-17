import express from 'express';
import * as projectsController from '../../controllers/projects-controller/projects.controller.js';
import * as validation from '../../middleware/validation/projects.validation.js';
import { authenticateService } from '../../middleware/auth.js';

const router = express.Router();

// Project routes
router.get('/', authenticateService(), projectsController.getProjects);
router.post('/', authenticateService(), projectsController.createProject);
router.get('/:projectId', authenticateService(), projectsController.getProject);
router.patch('/:projectId', authenticateService(), projectsController.updateProject);
router.delete('/:projectId', authenticateService(), projectsController.deleteProject);
router.get('/:projectId/dashboard', authenticateService(), projectsController.getProjectDashboard);
router.patch('/:projectId/collection', authenticateService(), projectsController.toggleCollectionStatus);

// Collection management routes
router.post('/:projectId/collections/add', authenticateService(), projectsController.addCollection);
router.post('/:projectId/collections/remove', authenticateService(), projectsController.removeCollection);

// Rule management routes
router.get('/:projectId/rules', authenticateService(), projectsController.getProjectRules);
router.get('/:projectId/rules/effective', authenticateService(), projectsController.getEffectiveRules);
router.put('/:projectId/rules', authenticateService(), projectsController.updateProjectRules);


// Browser request routes
router.get('/:projectId/browser-requests', authenticateService(), projectsController.getBrowserRequests);
router.post('/:projectId/browser-requests/:orgId', validation.validateProjectCollectingStatus, projectsController.createBrowserRequest);
router.post('/:projectId/browser-requests/bulk/:orgId', validation.validateProjectCollectingStatus, projectsController.bulkCreateBrowserRequests);
router.get('/:projectId/browser-requests/:requestId', authenticateService(), projectsController.getBrowserRequest);
router.put('/:projectId/browser-requests/:requestId', authenticateService(), projectsController.updateBrowserRequest);
router.delete('/:projectId/browser-requests/:requestId', authenticateService(), projectsController.deleteBrowserRequest);

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