import express from 'express';
import { healthCheck, notFoundHandler, globalErrorHandler } from '../middleware/routeHandlers.js';

const router = express.Router();

// Route imports
import ruleRoutes from './rule.routes.js';
import integrationRoutes from './integration.routes.js';
import rawRequestRoutes from './rawRequest.routes.js';
import scanRoutes from "./scan.routes.js";
import vulnerabilityRoutes from './vulnerability.routes.js';
import dashboardRoutes from './dashboard.routes.js';


// Health check endpoint
router.get('/health', healthCheck);

// API Routes - Use Kebab-case for route names
router.use('/rule', ruleRoutes);
router.use('/integration', integrationRoutes);
router.use('/raw-request', rawRequestRoutes);
router.use('/scan', scanRoutes);
router.use('/vulnerability', vulnerabilityRoutes);
router.use('/dashboard', dashboardRoutes);


// 404 handler - catches all unmatched routes
router.use(notFoundHandler);

// Global error handler - must be last
router.use(globalErrorHandler);

export default router;