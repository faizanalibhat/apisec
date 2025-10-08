# Simplified Code Templates

## 📁 **app.js**
```javascript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './env.js';
import apiRoutes from './routes/index.routes.js';
import { apiResponseMiddleware } from './middleware/apiResponse.middleware.js';
import './db/mongoose.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: ['application/x-yaml', 'text/yaml'] }));
app.use(apiResponseMiddleware);

// Add organizationId to all requests
app.use((req, res, next) => {
    req.organizationId = process.env.ORGANIZATION_ID || 'default-org-id';
    next();
});

// Routes
app.use('/api/v1', apiRoutes);

// Start server
app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
});

export default app;
```

## 📁 **routes/index.routes.js**
```javascript
import express from 'express';
import { healthCheck, notFoundHandler, globalErrorHandler } from '../middleware/routeHandlers.js';

// Import route files
import ruleRoutes from './rule.routes.js';
import integrationRoutes from './integration.routes.js';

const router = express.Router();

// Health check
router.get('/health', healthCheck);

// API Routes
router.use('/rule', ruleRoutes);
router.use('/integration', integrationRoutes);
// Add more routes here...

// Error handlers (must be last)
router.use(notFoundHandler);
router.use(globalErrorHandler);

export default router;
```

## 📁 **routes/rule.routes.js**
```javascript
import express from 'express';
import * as controller from '../controllers/rule.controller.js';

const router = express.Router();

// CRUD routes
router.get('/search', controller.searchRules);    // Special routes first
router.get('/', controller.getRules);             // GET all
router.post('/', controller.createRule);          // CREATE
router.get('/:id', controller.getRule);          // GET one
router.put('/:id', controller.updateRule);       // UPDATE
router.delete('/:id', controller.deleteRule);    // DELETE

export default router;
```

## 📁 **controllers/rule.controller.js**
```javascript
import { RuleService } from '../services/rule.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

class RuleController {
    constructor() {
        this.ruleService = new RuleService();
        
        // Bind all methods
        this.createRule = this.createRule.bind(this);
        this.getRules = this.getRules.bind(this);
        this.getRule = this.getRule.bind(this);
        this.updateRule = this.updateRule.bind(this);
        this.deleteRule = this.deleteRule.bind(this);
        this.searchRules = this.searchRules.bind(this);
    }

    async searchRules(req, res, next) {
        try {
            const { organizationId } = req;
            const { q, page = 1, limit = 20 } = req.query;

            if (!q) {
                throw ApiError.badRequest('Search query is required');
            }

            const result = await this.ruleService.searchRules({
                organizationId,
                query: q,
                page: parseInt(page),
                limit: parseInt(limit)
            });

            res.sendApiResponse(
                ApiResponse.paginated(
                    'Search results fetched successfully',
                    result.data,
                    result.pagination
                )
            );
        } catch (error) {
            next(error);
        }
    }

    async createRule(req, res, next) {
        try {
            const { organizationId } = req;
            const data = req.body;
            
            const rule = await this.ruleService.createRule({
                ...data,
                organizationId
            });

            res.sendApiResponse(
                ApiResponse.created('Rule created successfully', rule)
            );
        } catch (error) {
            next(error);
        }
    }

    async getRules(req, res, next) {
        try {
            const { organizationId } = req;
            const { page = 1, limit = 20 } = req.query;

            const result = await this.ruleService.getRules({
                organizationId,
                page: parseInt(page),
                limit: parseInt(limit)
            });

            res.sendApiResponse(
                ApiResponse.paginated(
                    'Rules fetched successfully',
                    result.data,
                    result.pagination
                )
            );
        } catch (error) {
            next(error);
        }
    }

    async getRule(req, res, next) {
        try {
            const { organizationId } = req;
            const { id } = req.params;

            const rule = await this.ruleService.getRule(id, organizationId);

            res.sendApiResponse(
                ApiResponse.success('Rule fetched successfully', rule)
            );
        } catch (error) {
            next(error);
        }
    }

    async updateRule(req, res, next) {
        try {
            const { organizationId } = req;
            const { id } = req.params;
            const updateData = req.body;

            const rule = await this.ruleService.updateRule(
                id, 
                updateData, 
                organizationId
            );

            res.sendApiResponse(
                ApiResponse.updated('Rule updated successfully', rule)
            );
        } catch (error) {
            next(error);
        }
    }

    async deleteRule(req, res, next) {
        try {
            const { organizationId } = req;
            const { id } = req.params;

            await this.ruleService.deleteRule(id, organizationId);

            res.sendApiResponse(
                ApiResponse.deleted('Rule deleted successfully')
            );
        } catch (error) {
            next(error);
        }
    }
}

// Export methods
const controller = new RuleController();
export const {
    searchRules,
    createRule,
    getRules,
    getRule,
    updateRule,
    deleteRule
} = controller;
```

## 📁 **services/rule.service.js**
```javascript
import Rule from '../models/rule.model.js';
import { ApiError } from '../utils/ApiError.js';

class RuleService {
    async createRule(data) {
        try {
            const rule = new Rule(data);
            await rule.save();
            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async searchRules({ organizationId, query, page, limit }) {
        try {
            const skip = (page - 1) * limit;
            
            const [rules, total] = await Promise.all([
                Rule.find({
                    organizationId,
                    $text: { $search: query }
                })
                .skip(skip)
                .limit(limit)
                .lean(),
                Rule.countDocuments({
                    organizationId,
                    $text: { $search: query }
                })
            ]);

            return {
                data: rules,
                pagination: this.getPagination(total, page, limit)
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getRules({ organizationId, page, limit }) {
        try {
            const skip = (page - 1) * limit;
            
            const [rules, total] = await Promise.all([
                Rule.find({ organizationId })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Rule.countDocuments({ organizationId })
            ]);

            return {
                data: rules,
                pagination: this.getPagination(total, page, limit)
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getRule(id, organizationId) {
        try {
            const rule = await Rule.findOne({ _id: id, organizationId }).lean();
            
            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async updateRule(id, updateData, organizationId) {
        try {
            const rule = await Rule.findOneAndUpdate(
                { _id: id, organizationId },
                updateData,
                { new: true, runValidators: true }
            );

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteRule(id, organizationId) {
        try {
            const rule = await Rule.findOneAndDelete({
                _id: id,
                organizationId
            });

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    // Helper methods
    getPagination(total, page, limit) {
        const pages = Math.ceil(total / limit);
        return {
            total,
            page,
            limit,
            pages,
            hasNextPage: page < pages,
            hasPrevPage: page > 1
        };
    }

    handleError(error) {
        if (error.name === 'ValidationError') {
            throw ApiError.validationError('Validation failed');
        }
        if (error.name === 'CastError') {
            throw ApiError.badRequest('Invalid ID format');
        }
        if (error.code === 11000) {
            throw ApiError.conflict('Resource already exists');
        }
        if (error instanceof ApiError) {
            throw error;
        }
        throw ApiError.internal('An unexpected error occurred');
    }
}

export { RuleService };
```

## 📁 **utils/ApiResponse.js**
```javascript
class ApiResponse {
    constructor(body, statusCode = 200) {
        this.body = {
            ...body,
            timestamp: new Date().toISOString()
        };
        this.statusCode = statusCode;
    }

    static success(message, data = null) {
        return new ApiResponse({
            status: 'success',
            message,
            data
        }, 200);
    }

    static created(message, data = null) {
        return new ApiResponse({
            status: 'success',
            message,
            data
        }, 201);
    }

    static updated(message, data = null) {
        return new ApiResponse({
            status: 'success',
            message,
            data
        }, 200);
    }

    static deleted(message = 'Resource deleted successfully') {
        return new ApiResponse({
            status: 'success',
            message
        }, 200);
    }

    static paginated(message, data, pagination) {
        return new ApiResponse({
            status: 'success',
            message,
            data,
            meta: { pagination }
        }, 200);
    }

    static error(message, errors = null, statusCode = 400) {
        return new ApiResponse({
            status: 'error',
            message,
            errors
        }, statusCode);
    }
}

export { ApiResponse };
```

## 📁 **utils/ApiError.js**
```javascript
export class ApiError extends Error {
    constructor(message, statusCode = 500, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true;
    }
    
    static badRequest(message = 'Bad Request') {
        return new ApiError(message, 400);
    }
    
    static unauthorized(message = 'Unauthorized') {
        return new ApiError(message, 401);
    }
    
    static forbidden(message = 'Forbidden') {
        return new ApiError(message, 403);
    }
    
    static notFound(message = 'Resource not found') {
        return new ApiError(message, 404);
    }
    
    static conflict(message = 'Resource already exists') {
        return new ApiError(message, 409);
    }
    
    static validationError(message = 'Validation error', errors = null) {
        return new ApiError(message, 400, errors);
    }
    
    static internal(message = 'Internal Server Error') {
        return new ApiError(message, 500);
    }
}
```