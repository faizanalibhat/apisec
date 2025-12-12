import { ScanService } from '../services/scan.service.js';
import Scan from '../models/scan.model.js';
import Vulnerabilities from '../models/vulnerability.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { mqbroker } from '../services/rabbitmq.service.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED_SCAN_STATUSES = ["paused", "resume", "cancelled", "halted"];

class ScanController {
  
  constructor() {
    this.scanService = new ScanService();
    
    // Bind all methods
    this.createScan = this.createScan.bind(this);
    this.getScans = this.getScans.bind(this);
    this.getScan = this.getScan.bind(this);
    this.getScanFindings = this.getScanFindings.bind(this);
    this.deleteScan = this.deleteScan.bind(this);
    this.updateScanExecution = this.updateScanExecution.bind(this);
    this.rescan = this.rescan.bind(this);
    this.flushScans = this.flushScans.bind(this);
  }


  async flushScans(req, res, next) {
    try {
      await Scan.deleteMany({ orgId: req.authenticatedService.orgId });
      await Vulnerabilities.deleteMany({ orgId: req.authenticatedService.orgId });

      return res.json({ message: "flushed" });
    }
    catch(err) {
      return res.status(500).json({ message: "error flushing" });
    }
  }

  async createScan(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { name, description, ruleIds, requestIds, environmentId, collectionIds = [], projectIds = [], scope, authProfileId } = req.body;
      
      const scanData = {
        name,
        description,
        ruleIds,
        requestIds,
        environmentId,
        collectionIds,
        projectIds,
        orgId,
        scope,
        authProfileId
      };
      
      const scan = await this.scanService.createScan(scanData);
      
      res.sendApiResponse(
        ApiResponse.created('Scan created successfully and processing started', scan)
      );
    } catch (error) {
      next(error);
    }
  }

  async getScans(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { page = 1, limit = 10, status, sortBy = 'createdAt', order = 'desc', search } = req.query;
      
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        sortBy,
        order,
        orgId, 
        search
      };
      
      const result = await this.scanService.getScans(options);
      
      res.sendApiResponse(
        ApiResponse.paginated(
          'Scans retrieved successfully', 
          result.data,
          {
            page: result.page,
            limit: result.limit,
            total: result.total,
            pages: result.pages
          }
        )
      );
    } catch (error) {
      next(error);
    }
  }

  async getScan(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { id } = req.params;
      
      const scan = await this.scanService.getScan(id, orgId);
      
      res.sendApiResponse(
        ApiResponse.success('Scan retrieved successfully', scan)
      );
    } catch (error) {
      next(error);
    }
  }

  async getScanFindings(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { id } = req.params;
      const { page = 1, limit = 20, severity } = req.query;
      
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        severity
      };
      
      const findings = await this.scanService.getScanFindings(id, orgId, options);
      
      res.sendApiResponse(
        ApiResponse.paginated(
          'Scan findings retrieved successfully',
          findings.data,
          {
            page: findings.page,
            limit: findings.limit,
            total: findings.total,
            pages: findings.pages
          }
        )
      );
    } catch (error) {
      next(error);
    }
  }

  async deleteScan(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { id } = req.params;
      
      await this.scanService.deleteScan(id, orgId);
      
      res.sendApiResponse(
        ApiResponse.success('Scan deleted successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  async updateScanExecution(req, res, next) {
    const { orgId } = req.authenticatedService;
    const scanId = req.params.id;

    const { status } = req.body;

    if (!ALLOWED_SCAN_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid state provided", allowed: ALLOWED_SCAN_STATUSES });

    let updated;

    // handle different statuses
    if (status == "cancelled" || status == "halted") {
      updated = await Scan.findOneAndUpdate({ _id: scanId, orgId }, { $set: { status }});
    }
    else if (status == "paused") {
      updated = await Scan.findOneAndUpdate({ _id: scanId, orgId }, { $set: { status }});
    }
    else if (status == "resume") {
      updated = await Scan.findOneAndUpdate({ _id: scanId, orgId }, { $set: { status: 'running' }});

      const json = updated.toJSON();

      await mqbroker.publish("apisec", "apisec.scan.run", json);
    }

    return res.json({ message: "Scan execution state updated", data: updated });
  }

  async rescan(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { id } = req.params;

      const scan = await this.scanService.rescan(id, orgId);

      res.sendApiResponse(
        ApiResponse.created('Rescan created successfully and processing started', scan)
      );
    } catch (error) {
      next(error);
    }
  }
}

const scanController = new ScanController();

export const {
  createScan,
  getScans,
  getScan,
  updateScanExecution,
  getScanFindings,
  deleteScan,
  rescan,
  flushScans
} = scanController;