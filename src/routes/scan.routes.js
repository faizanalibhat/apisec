import express from 'express';
import * as scanController from '../controllers/scan.controller.js';
import { 
  validateCreateScan, 
  validateGetScans, 
  validateScanId 
} from '../middleware/scan.validation.js';

const router = express.Router();

// Search must come before :id routes
router.get('/search', validateGetScans, scanController.searchScans);

// Create a new scan
router.post('/', validateCreateScan, scanController.createScan);

// Get all scans with pagination
router.get('/', validateGetScans, scanController.getScans);

// Get specific scan with findings
router.get('/:id', validateScanId, scanController.getScan);

// Get detailed findings for a scan
router.get('/:id/findings', validateScanId, scanController.getScanFindings);

// Delete a scan and all associated data
router.delete('/:id', validateScanId, scanController.deleteScan);

export default router;