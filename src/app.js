import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './env.js';
import apiV1Routes from './routes/index.routes.js';
import { apiResponseMiddleware } from './middleware/apiResponse.middleware.js';
import { scanWorker } from './workers/scan.worker.js';

// Database connection
import './db/mongoose.js';

// Initialize app
const app = express();
const port = env.APISEC_PORT || 80;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// parse raw text bodies
app.use(express.text({ type: ['application/x-yaml', 'text/yaml'] }))

// API Response middleware
app.use(apiResponseMiddleware);

app.use('/api/v1', apiV1Routes);


scanWorker();

// Start server
app.listen(port, () => {
    console.log(`APISEC server is running on port ${port}`);
});

export default app;