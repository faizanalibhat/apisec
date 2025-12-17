import express from 'express';
import * as controller from '../../controllers/dashboard.controller.js';

const router = express.Router();

// Dashboard statistics endpoint
router.get('/', controller.getDashboardStats);

export default router;