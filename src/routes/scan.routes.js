import express from 'express';
import * as scanController from '../controllers/scan.controller.js';
// import { 
//   validateCreateScan, 
//   validateGetScans, 
//   validateScanId 
// } from '../middleware/scan.validation.js';

const router = express.Router();

// Create a new scan
router.post('/', scanController.createScan);

// Get all scans with pagination
router.get('/', scanController.getScans);

// Get specific scan with findings
router.get('/:id', scanController.getScan);

router.post("/:id/execution", scanController.updateScanExecution)

// Get detailed findings for a scan
router.get('/:id/findings', scanController.getScanFindings);

// Delete a scan and all associated data
router.delete('/:id', scanController.deleteScan);

export default router;