import { body, param, query, validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

// Validation middleware handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg
    }));
    throw ApiError.validationError('Validation failed', errorMessages);
  }
  next();
};

// Create scan validation
export const validateCreateScan = [
  body('name')
    .trim()
    .notEmpty().withMessage('Scan name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Scan name must be between 3 and 100 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  
  body('scope')
    .optional()
    .isArray().withMessage('Scope must be an array of strings.')
    .custom((value) => {
      if (value && !value.every(item => typeof item === 'string')) {
        throw new Error('All items in scope must be strings.');
      }
      return true;
    }),

  body('ruleIds')
    .isArray({ min: 1 }).withMessage('At least one rule ID is required')
    .custom((value) => {
      if (!value.every(id => /^[0-9a-fA-F]{24}$/.test(id))) {
        throw new Error('All rule IDs must be valid MongoDB ObjectIds');
      }
      return true;
    }),
  
  body('requestIds')
    .optional()
    .isArray().withMessage('Request IDs must be an array')
    .custom((value) => {
      if (value && value.length > 0) {
        if (!value.every(id => /^[0-9a-fA-F]{24}$/.test(id))) {
          throw new Error('All request IDs must be valid MongoDB ObjectIds');
        }
      }
      return true;
    }),
  
  handleValidationErrors
];

// Get scans validation (with filters and pagination)
export const validateGetScans = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  query('status')
    .optional()
    .isIn(['pending', 'running', 'completed', 'failed', 'cancelled'])
    .withMessage('Invalid status value'),
  
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'name', 'status', 'vulnerabilitiesFound'])
    .withMessage('Invalid sort field'),
  
  query('order')
    .optional()
    .isIn(['asc', 'desc']).withMessage('Order must be asc or desc'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
  
  query('severity')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid severity value'),
  
  handleValidationErrors
];

// Validate scan ID parameter
export const validateScanId = [
  param('id')
    .notEmpty().withMessage('Scan ID is required')
    .isMongoId().withMessage('Invalid scan ID format'),
  
  handleValidationErrors
];

// Validate get scan findings
export const validateGetScanFindings = [
  param('id')
    .notEmpty().withMessage('Scan ID is required')
    .isMongoId().withMessage('Invalid scan ID format'),
  
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  query('severity')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid severity value'),
  
  handleValidationErrors
];

// Validate search scans
export const validateSearchScans = [
  query('search')
    .trim()
    .notEmpty().withMessage('Search query is required')
    .isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
  
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

// Validate scan status update (for future use)
export const validateUpdateScanStatus = [
  param('id')
    .notEmpty().withMessage('Scan ID is required')
    .isMongoId().withMessage('Invalid scan ID format'),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['cancelled']).withMessage('Only cancelled status is allowed for manual update'),
  
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Reason must not exceed 200 characters'),
  
  handleValidationErrors
];