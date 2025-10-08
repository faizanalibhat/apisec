import { ScanService } from '../services/scan.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

class ScanController {
  constructor() {
    this.scanService = new ScanService();
    
    // Bind all methods
    this.createScan = this.createScan.bind(this);
    this.getScans = this.getScans.bind(this);
    this.getScan = this.getScan.bind(this);
    this.getScanFindings = this.getScanFindings.bind(this);
    this.searchScans = this.searchScans.bind(this);
    this.deleteScan = this.deleteScan.bind(this);
  }

  async createScan(req, res, next) {
    try {
      const { organizationId } = req;
      const { name, description, ruleIds, requestIds } = req.body;
      
      const scanData = {
        name,
        description,
        ruleIds,
        requestIds,
        organizationId
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
      const { organizationId } = req;
      const { page = 1, limit = 10, status, sortBy = 'createdAt', order = 'desc' } = req.query;
      
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        sortBy,
        order,
        organizationId
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
      const { organizationId } = req;
      const { id } = req.params;
      
      const scan = await this.scanService.getScan(id, organizationId);
      
      res.sendApiResponse(
        ApiResponse.success('Scan retrieved successfully', scan)
      );
    } catch (error) {
      next(error);
    }
  }

  async getScanFindings(req, res, next) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      const { page = 1, limit = 20, severity } = req.query;
      
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        severity
      };
      
      const findings = await this.scanService.getScanFindings(id, organizationId, options);
      
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

  async searchScans(req, res, next) {
    try {
      const { organizationId } = req;
      const { search, page = 1, limit = 10 } = req.query;
      
      if (!search) {
        throw ApiError.badRequest('Search query is required');
      }
      
      const options = {
        search,
        page: parseInt(page),
        limit: parseInt(limit),
        organizationId
      };
      
      const result = await this.scanService.searchScans(options);
      
      res.sendApiResponse(
        ApiResponse.paginated(
          'Search results retrieved successfully',
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

  async deleteScan(req, res, next) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      
      await this.scanService.deleteScan(id, organizationId);
      
      res.sendApiResponse(
        ApiResponse.success('Scan deleted successfully')
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
  getScanFindings,
  searchScans,
  deleteScan
} = scanController;