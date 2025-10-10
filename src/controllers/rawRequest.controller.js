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
    this.bulkDelete = this.bulkDelete.bind(this);
  }

  async createRawRequest(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const result = await this.service.create({
        ...req.body,
        orgId,
      });
      res.sendApiResponse(ApiResponse.created('Raw request created successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getRawRequests(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { 
        page = 1, 
        limit = 10, 
        search, 
        sort,
        method, 
        workspace,
        collectionName, 
        integrationId 
      } = req.query;
      
      // Build filters
      const filters = {
        orgId,
        ...(method && { method: method.toUpperCase() }),
        ...(workspace && { workspaceName: workspace }),
        ...(collectionName && { collectionName }),
        ...(integrationId && { integrationId }),
      };

      // Parse sort parameter
      let sortOptions = { createdAt: -1 }; // Default sort
      if (sort) {
        const [field, order] = sort.split(':');
        const allowedSortFields = ['createdAt', 'method', 'collectionName'];
        
        if (allowedSortFields.includes(field)) {
          sortOptions = { [field]: order === 'asc' ? 1 : -1 };
        }
      }

      const paginationOptions = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
      };

      let result;
      
      if (search && search.trim().length > 0) {
        // Use search functionality with filters and sorting
        result = await this.service.searchWithFiltersAndSort(
          search, 
          filters, 
          sortOptions,
          paginationOptions
        );
      } else {
        // Use regular findAll with sorting
        result = await this.service.findAllWithSort(
          filters, 
          sortOptions,
          paginationOptions
        );
      }

      const response = ApiResponse.paginated(
        search ? 'Search results retrieved successfully' : 'Raw requests retrieved successfully',
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
      const { orgId } = req.authenticatedService;
      const { id } = req.params;
      
      const result = await this.service.findOne(id, orgId);
      res.sendApiResponse(ApiResponse.success('Raw request retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateRawRequest(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { id } = req.params;
      
      const result = await this.service.update(id, req.body, orgId);
      res.sendApiResponse(ApiResponse.success('Raw request updated successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async deleteRawRequest(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { id } = req.params;
      
      await this.service.delete(id, orgId);
      res.sendApiResponse(ApiResponse.success('Raw request deleted successfully'));
    } catch (error) {
      next(error);
    }
  }

  async bulkDelete(req, res, next) {
    try {
      const { orgId } = req.authenticatedService;
      const { requestIds } = req.body;

      const result = await this.service.bulkDelete(requestIds, orgId);
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
  bulkDelete,
} = controller;