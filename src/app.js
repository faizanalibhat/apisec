import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from "morgan";
import env from './env.js';
import { traceContext } from './middleware/trace-context.middleware.js';
import apiV1Routes from './routes/index.routes.js';
import { apiResponseMiddleware } from './middleware/apiResponse.middleware.js';
import { activityLogger } from './middleware/activity.middleware.js';
import { healthCheck, notFoundHandler, globalErrorHandler } from './middleware/routeHandlers.js';
import './crons/scan-progress.cron.js';
import { logger } from './utils/logger.js';

// Database connection
import { connectDB } from "./db/connect-db.js"

connectDB();

// Initialize app
const app = express();
const port = env.APISEC_PORT || 80;

// Security middleware
app.use(helmet());

app.use(traceContext);

app.use(morgan('tiny'));

// CORS configuration
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// parse raw text bodies
app.use(express.text({ type: ['application/x-yaml', 'text/yaml'] }))

// API Response middleware
app.use(apiResponseMiddleware);

// Activity logger middleware
app.use(activityLogger);

app.use('/apisec/api', apiV1Routes);


// 404 handler - catches all unmatched routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(globalErrorHandler);

// Start server
app.listen(port, () => {
    logger.info(`Web Application Scanner is running on port ${port}`, {
        actor: {
            name: "System",
            email: "system",
            id: "system",
            user_id: ""
        },
        event: {
            action: "app.started",
        }
    })
    console.log(`APISEC server is running on port ${port}`);
});

export default app;