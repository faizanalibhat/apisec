import { body, param, query, validationResult } from 'express-validator';
import { ApiError } from '../../utils/ApiError.js';

// Validation middleware handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
    }));
    throw ApiError.validationError('Validation failed', formattedErrors);
  }
  next();
};

// Validate ObjectId parameter
export const validateObjectId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  handleValidationErrors,
];

// Validate get raw requests with filters, search, and sort
export const validateGetRawRequests = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Search query must be at least 2 characters long'),

  query('sort')
    .optional()
    .custom((value) => {
      if (!value) return true;
      const [field, order] = value.split(':');
      const allowedFields = ['createdAt', 'method', 'collectionName'];
      const allowedOrders = ['asc', 'desc'];
      
      if (!field || !order) {
        throw new Error('Sort format must be field:order (e.g., createdAt:desc)');
      }
      if (!allowedFields.includes(field)) {
        throw new Error(`Sort field must be one of: ${allowedFields.join(', ')}`);
      }
      if (!allowedOrders.includes(order)) {
        throw new Error('Sort order must be either asc or desc');
      }
      return true;
    }),

  query('method')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    .withMessage('Invalid HTTP method'),

  query('workspace')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Workspace cannot be empty'),

  query('collectionName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Collection name cannot be empty'),

  query('integrationId')
    .optional()
    .isMongoId()
    .withMessage('Invalid integration ID format'),

  query('hasVulns').optional().isIn(['true', 'false', 'critical', 'high', 'medium', 'low']).withMessage('Invalid vulnerability filter'),

  handleValidationErrors,
];

// Validate create raw request
export const validateCreateRawRequest = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 200 })
    .withMessage('Name must not exceed 200 characters'),

  body('method')
    .trim()
    .notEmpty()
    .withMessage('Method is required')
    .toUpperCase()
    .isIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    .withMessage('Invalid HTTP method'),

  body('url')
    .trim()
    .notEmpty()
    .withMessage('URL is required'),

  body('integrationId')
    .notEmpty()
    .withMessage('Integration ID is required')
    .isMongoId()
    .withMessage('Invalid integration ID format'),

  body('collectionName')
    .trim()
    .notEmpty()
    .withMessage('Collection name is required'),

  body('workspaceName')
    .trim()
    .notEmpty()
    .withMessage('Workspace name is required'),

  body('headers')
    .optional()
    .isObject()
    .withMessage('Headers must be an object'),

  body('params')
    .optional()
    .isObject()
    .withMessage('Params must be an object'),

  body('body')
    .optional(),

  body('folderName')
    .optional()
    .trim(),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),

  body('postmanId')
    .optional()
    .trim(),

  handleValidationErrors,
];

// Validate update raw request
export const validateUpdateRawRequest = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 200 })
    .withMessage('Name must not exceed 200 characters'),

  body('method')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    .withMessage('Invalid HTTP method'),

  body('url')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('URL cannot be empty'),

  body('headers')
    .optional()
    .isObject()
    .withMessage('Headers must be an object'),

  body('params')
    .optional()
    .isObject()
    .withMessage('Params must be an object'),

  body('body')
    .optional(),

  body('folderName')
    .optional()
    .trim(),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),

  // Prevent updating certain fields
  body(['_id', 'orgId', 'integrationId', 'createdAt', 'updatedAt'])
    .not()
    .exists()
    .withMessage('This field cannot be updated'),

  handleValidationErrors,
];

// Validate bulk delete
export const validateBulkDelete = [
  body('requestIds')
    .isArray({ min: 1 })
    .withMessage('Request IDs must be a non-empty array')
    .custom((value) => {
      return value.every(id => /^[0-9a-fA-F]{24}$/.test(id));
    })
    .withMessage('All request IDs must be valid MongoDB ObjectIds'),

  handleValidationErrors,
];

// Validate search query (DEPRECATED - use validateGetRawRequests instead)
export const validateSearch = [
  query('search')
    .trim()
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 2 })
    .withMessage('Search query must be at least 2 characters long'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  handleValidationErrors,
];