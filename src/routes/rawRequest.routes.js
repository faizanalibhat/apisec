import express from 'express';
import * as rawRequestController from '../controllers/rawRequest.controller.js';
import * as validation from '../middleware/validation/rawRequest.validation.js';

const router = express.Router();

// Bulk operations
router.post('/bulk/delete', validation.validateBulkDelete, rawRequestController.bulkDelete);

router
  .post('/', validation.validateCreateRawRequest, rawRequestController.createRawRequest)
  // .get('/', validation.validateGetRawRequests, rawRequestController.getRawRequests)
  .get('/', rawRequestController.getRawRequests)
  .get('/:id', validation.validateObjectId, rawRequestController.getRawRequest)
  .put('/:id', validation.validateObjectId, validation.validateUpdateRawRequest, rawRequestController.updateRawRequest)
  .delete('/:id', validation.validateObjectId, rawRequestController.deleteRawRequest);

export default router;