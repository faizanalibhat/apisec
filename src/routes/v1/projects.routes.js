import express from 'express';
import * as projectsController from '../../controllers/projects-controller/projects.controller.js';
import * as validation from '../../middleware/validation/projects.validation.js';
import { authenticateService } from '../../middleware/auth.js';

import { uploadSingle } from '../../middleware/file-upload.js';

const router = express.Router();

// Project routes
router.get('/', authenticateService(), projectsController.getProjects);
router.post('/', authenticateService(), projectsController.createProject);
router.get('/:projectId', authenticateService(), projectsController.getProject);
router.patch('/:projectId', authenticateService(), projectsController.updateProject);
router.delete('/:projectId', authenticateService(), projectsController.deleteProject);
router.get('/:projectId/dashboard', authenticateService(), projectsController.getProjectDashboard);
router.patch('/:projectId/collection', authenticateService(), projectsController.toggleCollectionStatus);


// application setup
router.patch("/:projectId/configure", authenticateService(), projectsController.configureProject);
router.post("/:projectId/configure/upload", authenticateService(), uploadSingle("file"), projectsController.uploadAuthScript);

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