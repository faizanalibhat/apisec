import express from 'express';
import { healthCheck } from '../middleware/routeHandlers.js';

const router = express.Router();

// Route imports
import v1_routes from './v1/index.js';


router.use("/v1", v1_routes);

// Health check endpoint
router.get('/v1/health', healthCheck);


export default router;