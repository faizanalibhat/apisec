import Joi from 'joi';
import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import { Projects } from '../../models/projects.model.js';

const objectIdSchema = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'ObjectId validation');

// Schema for browser request data from extension
const browserRequestSchema = Joi.object({
  source: Joi.string().valid('ReqMapper').optional(),
  timestamp: Joi.string().isoDate().required(),
  request: Joi.object({
    name: Joi.string().optional(),
    request: Joi.object({
      method: Joi.string()
        .valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')
        .required(),
      header: Joi.array().items(
        Joi.object({
          key: Joi.string().required(),
          value: Joi.string().allow('').required()
        })
      ).optional(),
      url: Joi.object({
        raw: Joi.string().uri().required(),
        protocol: Joi.string().optional(),
        host: Joi.array().items(Joi.string()).optional(),
        port: Joi.string().optional(),
        path: Joi.array().items(Joi.string()).optional(),
        query: Joi.array().items(
          Joi.object({
            key: Joi.string().required(),
            value: Joi.string().allow('').required()
          })
        ).optional()
      }).required(),
      body: Joi.any().optional()
    }).required(),
    response: Joi.object({
      status: Joi.number().optional(),
      code: Joi.number().optional(),
      header: Joi.array().optional(),
      body: Joi.string().allow('').optional()
    }).optional(),
    timestamp: Joi.number().optional(),
    tabId: Joi.number().optional()
  }).required()
});

// Validation middleware
export const validateObjectId = (req, res, next) => {
  const { projectId, requestId } = req.params;
  
  const validateId = (id, name) => {
    if (id && !mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest(`Invalid ${name} format`);
    }
  };

  try {
    validateId(projectId, 'project ID');
    validateId(requestId, 'request ID');
    next();
  } catch (error) {
    next(error);
  }
};

export const validateProjectCollectingStatus = async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const project = await Projects.findById(projectId);

        if (!project) {
            throw ApiError.notFound('Project not found');
        }

        if (!project.isCollecting) {
            throw ApiError.forbidden('Request collection is disabled for this project');
        }

        next();
    } catch (error) {
        next(error);
    }
}

export const validateCreateProject = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    collectionUids: Joi.array().items(Joi.string()).optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return next(ApiError.validationError('Validation failed', error.details));
  }
  next();
};

export const validateUpdateProject = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(1).max(100).optional(),
    description: Joi.string().trim().max(500).optional()
  }).min(1);

  const { error } = schema.validate(req.body);
  if (error) {
    return next(ApiError.validationError('Validation failed', error.details));
  }
  next();
};

export const validateAddCollection = (req, res, next) => {
  const schema = Joi.object({
    collectionUid: Joi.string().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return next(ApiError.validationError('Validation failed', error.details));
  }
  next();
};

export const validateRemoveCollection = (req, res, next) => {
  const schema = Joi.object({
    collectionUid: Joi.string().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return next(ApiError.validationError('Validation failed', error.details));
  }
  next();
};

export const validateUpdateRules = (req, res, next) => {
  const schema = Joi.object({
    includedRuleIds: Joi.array()
      .items(objectIdSchema)
      .optional(),
    excludedRuleIds: Joi.array()
      .items(objectIdSchema)
      .optional()
  }).or('includedRuleIds', 'excludedRuleIds'); // At least one must be provided

  const { error } = schema.validate(req.body);
  if (error) {
    return next(ApiError.validationError('Invalid rule configuration', error.details));
  }
  next();
};

export const validateCreateBrowserRequest = (req, res, next) => {
  const { error } = browserRequestSchema.validate(req.body);
  if (error) {
    return next(ApiError.validationError('Invalid browser request data', error.details));
  }
  next();
};

export const validateBulkCreateBrowserRequests = (req, res, next) => {
  const schema = Joi.object({
    requests: Joi.array()
      .items(browserRequestSchema)
      .min(1)
      .max(100) // Limit bulk operations to 100 items
      .required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return next(ApiError.validationError('Invalid bulk request data', error.details));
  }
  next();
};

export const validateUpdateBrowserRequest = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(1).max(255).optional(),
    method: Joi.string()
      .valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')
      .optional(),
    url: Joi.string().uri().optional(),
    headers: Joi.object().pattern(
      Joi.string(),
      Joi.string()
    ).optional(),
    params: Joi.object().pattern(
      Joi.string(),
      Joi.string()
    ).optional(),
    body: Joi.any().optional(),
    body_format: Joi.string()
      .valid('json', 'xml', 'urlencoded', 'formdata', 'text', 'raw')
      .optional(),
    description: Joi.string().optional()
  }).min(1);

  const { error } = schema.validate(req.body);
  if (error) {
    return next(ApiError.validationError('Validation failed', error.details));
  }
  next();
};
