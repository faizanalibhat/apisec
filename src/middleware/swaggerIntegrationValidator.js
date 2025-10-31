import Joi from 'joi';
import { ApiError } from '../utils/ApiError.js';

class SwaggerIntegrationValidator {
    static validateCreate(req, res, next) {
        const schema = Joi.object({
            sourceUrl: Joi.string()
                .uri({ scheme: ['http', 'https'] })
                .required()
                .messages({
                    'string.uri': 'Source URL must be a valid HTTP or HTTPS URL',
                    'any.required': 'Source URL is required'
                }),
            name: Joi.string()
                .trim()
                .min(3)
                .max(100)
                .optional()
                .messages({
                    'string.min': 'Name must be at least 3 characters long',
                    'string.max': 'Name cannot exceed 100 characters'
                }),
            description: Joi.string()
                .trim()
                .max(500)
                .optional()
                .allow('')
                .messages({
                    'string.max': 'Description cannot exceed 500 characters'
                })
        });

        const { error, value } = schema.validate(req.body, { abortEarly: false });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            return next(ApiError.validationError('Validation failed', errors));
        }

        req.body = value;
        next();
    }

    static validateUpdate(req, res, next) {
        const schema = Joi.object({
            name: Joi.string()
                .trim()
                .min(3)
                .max(100)
                .optional()
                .messages({
                    'string.min': 'Name must be at least 3 characters long',
                    'string.max': 'Name cannot exceed 100 characters'
                }),
            description: Joi.string()
                .trim()
                .max(500)
                .optional()
                .allow('')
                .messages({
                    'string.max': 'Description cannot exceed 500 characters'
                })
        }).min(1).messages({
            'object.min': 'At least one field must be provided for update'
        });

        const { error, value } = schema.validate(req.body, { abortEarly: false });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            return next(ApiError.validationError('Validation failed', errors));
        }

        req.body = value;
        next();
    }

    static validateId(req, res, next) {
        const schema = Joi.object({
            id: Joi.string()
                .pattern(/^[0-9a-fA-F]{24}$/)
                .required()
                .messages({
                    'string.pattern.base': 'Invalid integration ID format',
                    'any.required': 'Integration ID is required'
                })
        });

        const { error, value } = schema.validate(req.params, { abortEarly: false });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            return next(ApiError.validationError('Validation failed', errors));
        }

        req.params = value;
        next();
    }

    static validatePagination(req, res, next) {
        const schema = Joi.object({
            page: Joi.number()
                .integer()
                .min(1)
                .default(1)
                .messages({
                    'number.min': 'Page number must be at least 1',
                    'number.integer': 'Page must be an integer'
                }),
            limit: Joi.number()
                .integer()
                .min(1)
                .max(100)
                .default(10)
                .messages({
                    'number.min': 'Limit must be at least 1',
                    'number.max': 'Limit cannot exceed 100',
                    'number.integer': 'Limit must be an integer'
                }),
            search: Joi.string()
                .trim()
                .max(200)
                .optional()
                .allow('')
                .messages({
                    'string.max': 'Search query cannot exceed 200 characters'
                })
        });

        const { error, value } = schema.validate(req.query, { abortEarly: false });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            return next(ApiError.validationError('Validation failed', errors));
        }

        req.query = value;
        next();
    }

    static validateUrl(req, res, next) {
        const schema = Joi.object({
            sourceUrl: Joi.string()
                .uri({ scheme: ['http', 'https'] })
                .required()
                .messages({
                    'string.uri': 'Must be a valid HTTP or HTTPS URL',
                    'any.required': 'Source URL is required'
                })
        });

        const { error, value } = schema.validate(req.body, { abortEarly: false });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            return next(ApiError.validationError('Validation failed', errors));
        }

        req.body = value;
        next();
    }
}

export default SwaggerIntegrationValidator;