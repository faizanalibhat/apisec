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
import transformedRequestsRoutes from "./transformed_request.routes.js";
import rawEnvironmentRoutes from "./rawEnvironment.routes.js";
import collectionsRoutes from "./collections.routes.js";
import configRoutes from "./config.routes.js";
import projectRoutes from "./projects.routes.js";

import { authenticateService } from '../middleware/auth.js';


// Health check endpoint
router.get('/health', healthCheck);

// API Routes - Use Kebab-case for route names
router.use('/rule', authenticateService(), ruleRoutes);
router.use('/integration', authenticateService(), integrationRoutes);
router.use('/raw-request', authenticateService(), rawRequestRoutes);
router.use('/scan', authenticateService(), scanRoutes);
router.use('/vulnerability', authenticateService(), vulnerabilityRoutes);
router.use('/dashboard', authenticateService(), dashboardRoutes);
router.use("/transformed_requests", authenticateService(), transformedRequestsRoutes);
router.use("/raw-environments", authenticateService(), rawEnvironmentRoutes);
router.use("/collections", authenticateService(), collectionsRoutes);
router.use("/config", authenticateService(), configRoutes);
router.use("/projects", authenticateService(), projectRoutes);


// 404 handler - catches all unmatched routes
router.use(notFoundHandler);

// Global error handler - must be last
router.use(globalErrorHandler);

export default router;