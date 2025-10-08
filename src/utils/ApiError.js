export class ApiError extends Error {
    constructor(message, statusCode = 500, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;
        this.errors = errors;
        
        Error.captureStackTrace(this, this.constructor);
    }
    
    static badRequest(message = 'Bad Request', errors = null) {
        return new ApiError(message, 400, errors);
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
    
    static validationError(message = 'Validation error', errors) {
        return new ApiError(message, 400, errors);
    }
    
    static internal(message = 'Internal Server Error') {
        return new ApiError(message, 500);
    }
}