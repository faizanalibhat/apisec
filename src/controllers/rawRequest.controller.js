import RawRequestService from '../services/rawRequest.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

class RawRequestController {
  constructor() {
    this.service = new RawRequestService();
    
    // Bind all methods
    this.createRawRequest = this.createRawRequest.bind(this);
    this.getRawRequests = this.getRawRequests.bind(this);
    this.getRawRequest = this.getRawRequest.bind(this);
    this.updateRawRequest = this.updateRawRequest.bind(this);
    this.deleteRawRequest = this.deleteRawRequest.bind(this);
    this.searchRawRequests = this.searchRawRequests.bind(this);
    this.bulkDelete = this.bulkDelete.bind(this);
  }

  async createRawRequest(req, res, next) {
    try {
      const { organizationId } = req;
      const result = await this.service.create({
        ...req.body,
        organizationId,
      });
      res.sendApiResponse(ApiResponse.created('Raw request created successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getRawRequests(req, res, next) {
    try {
      const { organizationId } = req;
      const { page = 1, limit = 10, method, collectionName, integrationId } = req.query;
      
      const filters = {
        organizationId,
        ...(method && { method: method.toUpperCase() }),
        ...(collectionName && { collectionName }),
        ...(integrationId && { integrationId }),
      };

      const result = await this.service.findAll(filters, {
        page: parseInt(page),
        limit: parseInt(limit),
      });

      const response = ApiResponse.paginated(
        'Raw requests retrieved successfully',
        result.data,
        {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalItems: result.totalItems,
          itemsPerPage: result.itemsPerPage,
        }
      );

      res.sendApiResponse(response);
    } catch (error) {
      next(error);
    }
  }

  async getRawRequest(req, res, next) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      
      const result = await this.service.findOne(id, organizationId);
      res.sendApiResponse(ApiResponse.success('Raw request retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateRawRequest(req, res, next) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      
      const result = await this.service.update(id, req.body, organizationId);
      res.sendApiResponse(ApiResponse.success('Raw request updated successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async deleteRawRequest(req, res, next) {
    try {
      const { organizationId } = req;
      const { id } = req.params;
      
      await this.service.delete(id, organizationId);
      res.sendApiResponse(ApiResponse.success('Raw request deleted successfully'));
    } catch (error) {
      next(error);
    }
  }

  async searchRawRequests(req, res, next) {
    try {
      const { organizationId } = req;
      const { search, page = 1, limit = 10 } = req.query;

      if (!search || search.trim().length === 0) {
        throw ApiError.badRequest('Search query is required');
      }

      const result = await this.service.search(
        search,
        organizationId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
        }
      );

      const response = ApiResponse.paginated(
        'Search results retrieved successfully',
        result.data,
        {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalItems: result.totalItems,
          itemsPerPage: result.itemsPerPage,
        }
      );

      res.sendApiResponse(response);
    } catch (error) {
      next(error);
    }
  }

  async bulkDelete(req, res, next) {
    try {
      const { organizationId } = req;
      const { requestIds } = req.body;

      const result = await this.service.bulkDelete(requestIds, organizationId);
      res.sendApiResponse(
        ApiResponse.success(
          `${result.deletedCount} raw requests deleted successfully`,
          result
        )
      );
    } catch (error) {
      next(error);
    }
  }
}

const controller = new RawRequestController();

export const {
  createRawRequest,
  getRawRequests,
  getRawRequest,
  updateRawRequest,
  deleteRawRequest,
  searchRawRequests,
  bulkDelete,
} = controller;