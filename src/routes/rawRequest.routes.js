import express from 'express';
import * as rawRequestController from '../controllers/rawRequest.controller.js';
import * as validation from '../middleware/validation/rawRequest.validation.js';

const router = express.Router();

// Search endpoint - MUST BE BEFORE :id routes
router.get('/search', rawRequestController.searchRawRequests);

// Bulk operations
router.post('/bulk/delete', validation.validateBulkDelete, rawRequestController.bulkDelete);

router
  .get('/', rawRequestController.getRawRequests)
  .post('/', validation.validateCreateRawRequest, rawRequestController.createRawRequest)
  .get('/:id', validation.validateObjectId, rawRequestController.getRawRequest)
  .put('/:id', validation.validateObjectId, validation.validateUpdateRawRequest, rawRequestController.updateRawRequest)
  .delete('/:id', validation.validateObjectId, rawRequestController.deleteRawRequest);

export default router;