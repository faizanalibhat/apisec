import express from 'express';
import { ProjectController } from '../controllers/projects.controller.js';

const router = express.Router();

router.get('/', ProjectController.getProjects);
router.post('/', ProjectController.createProject);
router.patch('/:projectId', ProjectController.updateProject);
router.post('/:projectId/collections/add', ProjectController.addCollection);
router.post('/:projectId/collections/remove', ProjectController.removeCollection);
router.delete('/:projectId', ProjectController.deleteCollection);

export default router;