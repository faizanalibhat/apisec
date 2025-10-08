import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

// Health check endpoint
const healthCheck = (req, res) => {
    res.sendApiResponse(
        ApiResponse.success('Server is healthy', {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        })
    );
};

// 404 handler
const notFoundHandler = (req, res) => {
    res.sendApiResponse(
        ApiResponse.error('Route not found mate :/', null, 404)
    );
};

// Global error handler
const globalErrorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Handle ApiError instances
    if (err instanceof ApiError) {
        return res.sendApiResponse(
            ApiResponse.error(err.message, err.errors, err.statusCode)
        );
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => ({
            field: e.path,
            message: e.message
        }));
        
        return res.sendApiResponse(
            ApiResponse.error('Validation error', errors, 400)
        );
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.sendApiResponse(
            ApiResponse.error('Invalid token', null, 401)
        );
    }

    // MongoDB duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return res.sendApiResponse(
            ApiResponse.error(`${field} already exists`, null, 409)
        );
    }

    // Default error
    res.sendApiResponse(
        ApiResponse.error(
            err.message || 'Internal server error',
            null,
            err.statusCode || 500
        )
    );
};

// Export all functions at the end
export { healthCheck, notFoundHandler, globalErrorHandler };