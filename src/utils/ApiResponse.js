class ApiResponse {
    constructor({ status, message, data, meta, errors }, statusCode = 200) {
        this.body = this.formatResponseBody({ status, message, data, meta, errors }, statusCode);
        this.statusCode = statusCode;
    }

    formatResponseBody({ status, message, data, meta, errors }, statusCode) {
        const response = {
            status: status || (statusCode < 400 ? 'success' : 'error'),
            message
        };

        // Add errors for error responses
        if (statusCode >= 400 && errors) {
            response.errors = errors;
        }

        // Add data if provided
        if (data !== undefined && data !== null) {
            response.data = data;
        }

        // Add meta information if provided
        if (meta) {
            response.meta = meta;
        }

        // Add timestamp
        response.timestamp = new Date().toISOString();

        return response;
    }

    // Static factory methods for common responses
    static success(message, data = null, statusCode = 200) {
        return new ApiResponse({ status: 'success', message, data }, statusCode);
    }

    static error(message, errors = null, statusCode = 400) {
        return new ApiResponse({ status: 'error', message, errors }, statusCode);
    }

    static created(message, data = null) {
        return new ApiResponse({ status: 'success', message, data }, 201);
    }

    static updated(message, data = null) {
        return new ApiResponse({ status: 'success', message, data }, 200);
    }

    static deleted(message = 'Resource deleted successfully') {
        return new ApiResponse({ status: 'success', message }, 200);
    }

    static paginated(message, data, pagination) {
        return new ApiResponse({
            status: 'success',
            message,
            data,
            meta: { pagination }
        }, 200);
    }

    static unauthorized(message = 'Unauthorized') {
        return new ApiResponse({ status: 'error', message }, 401);
    }

    static forbidden(message = 'Forbidden') {
        return new ApiResponse({ status: 'error', message }, 403);
    }

    static notFound(message = 'Resource not found') {
        return new ApiResponse({ status: 'error', message }, 404);
    }

    static conflict(message = 'Resource already exists') {
        return new ApiResponse({ status: 'error', message }, 409);
    }

    static validationError(message = 'Validation error', errors) {
        return new ApiResponse({ status: 'error', message, errors }, 400);
    }
}

export { ApiResponse };