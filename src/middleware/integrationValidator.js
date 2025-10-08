import { ApiError } from '../utils/ApiError.js';

class IntegrationValidator {
    // Validate create integration request
    static validateCreate(req, res, next) {
        try {
            const { apiKey, name, workspaceIds } = req.body;

            // Check required fields
            if (!apiKey) {
                throw ApiError.badRequest('API key is required');
            }

            if (!name || name.trim().length === 0) {
                throw ApiError.badRequest('Integration name is required');
            }

            if (!workspaceIds || !Array.isArray(workspaceIds) || workspaceIds.length === 0) {
                throw ApiError.badRequest('At least one workspace must be selected');
            }

            // Validate API key format (basic check for Postman API key pattern)
            if (apiKey.length < 20) {
                throw ApiError.badRequest('Invalid API key format');
            }

            // Validate name length
            if (name.trim().length < 3) {
                throw ApiError.badRequest('Integration name must be at least 3 characters long');
            }

            if (name.trim().length > 100) {
                throw ApiError.badRequest('Integration name must not exceed 100 characters');
            }

            // Clean up the data
            req.body.name = name.trim();
            req.body.apiKey = apiKey.trim();
            req.body.description = req.body.description?.trim() || '';

            next();
        } catch (error) {
            next(error);
        }
    }

    // Validate update integration request
    static validateUpdate(req, res, next) {
        try {
            const { name, description } = req.body;

            // At least one field should be provided for update
            if (!name && description === undefined) {
                throw ApiError.badRequest('At least one field (name or description) must be provided for update');
            }

            // Validate name if provided
            if (name !== undefined) {
                if (typeof name !== 'string' || name.trim().length === 0) {
                    throw ApiError.badRequest('Integration name cannot be empty');
                }

                if (name.trim().length < 3) {
                    throw ApiError.badRequest('Integration name must be at least 3 characters long');
                }

                if (name.trim().length > 100) {
                    throw ApiError.badRequest('Integration name must not exceed 100 characters');
                }

                req.body.name = name.trim();
            }

            // Clean description if provided
            if (description !== undefined) {
                req.body.description = description.trim();
            }

            next();
        } catch (error) {
            next(error);
        }
    }

    // Validate MongoDB ObjectId format
    static validateId(req, res, next) {
        try {
            const { id } = req.params;

            if (!id) {
                throw ApiError.badRequest('Integration ID is required');
            }

            // Basic MongoDB ObjectId format check
            if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                throw ApiError.badRequest('Invalid integration ID format');
            }

            next();
        } catch (error) {
            next(error);
        }
    }

    // Validate get workspaces request
    static validateGetWorkspaces(req, res, next) {
        try {
            const { apiKey } = req.body;

            if (!apiKey) {
                throw ApiError.badRequest('API key is required to fetch workspaces');
            }

            if (typeof apiKey !== 'string' || apiKey.trim().length < 20) {
                throw ApiError.badRequest('Invalid API key format');
            }

            req.body.apiKey = apiKey.trim();

            next();
        } catch (error) {
            next(error);
        }
    }

    // Validate pagination parameters
    static validatePagination(req, res, next) {
        try {
            let { page, limit } = req.query;

            // Default values
            page = parseInt(page) || 1;
            limit = parseInt(limit) || 10;

            // Validate page
            if (page < 1) {
                throw ApiError.badRequest('Page number must be greater than 0');
            }

            // Validate limit
            if (limit < 1) {
                throw ApiError.badRequest('Limit must be greater than 0');
            }

            if (limit > 100) {
                throw ApiError.badRequest('Limit cannot exceed 100 items per page');
            }

            // Set validated values
            req.query.page = page;
            req.query.limit = limit;

            next();
        } catch (error) {
            next(error);
        }
    }
}

export default IntegrationValidator;