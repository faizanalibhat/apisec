import RawEnvironmentService from '../services/rawEnvironment.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

class RawEnvironmentController {
    constructor() {
        this.service = new RawEnvironmentService();

        // Bind all methods
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getOne = this.getOne.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.search = this.search.bind(this);
        this.getByWorkspace = this.getByWorkspace.bind(this);
        this.bulkDelete = this.bulkDelete.bind(this);
    }

    async create(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const result = await this.service.create({
                ...req.body,
                orgId,
            });
            res.sendApiResponse(ApiResponse.created('Raw environment created successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async getAll(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const {
                page = 1,
                limit = 10,
                sort,
                workspaceId,
                integrationId,
                isEdited
            } = req.query;

            // Build filters
            const filters = {
                orgId,
                ...(workspaceId && { workspaceId }),
                ...(integrationId && { integrationId }),
                ...(isEdited !== undefined && { isEdited: isEdited === 'true' }),
            };

            // Parse sort parameter
            let sortOptions = { createdAt: -1 }; // Default sort
            if (sort) {
                const [field, order] = sort.split(':');
                const allowedSortFields = ['createdAt', 'name', 'workspaceName', 'postmanUpdatedAt'];

                if (allowedSortFields.includes(field)) {
                    sortOptions = { [field]: order === 'asc' ? 1 : -1 };
                }
            }

            const paginationOptions = {
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 10,
            };

            const result = await this.service.findAll(
                filters,
                sortOptions,
                paginationOptions
            );

            const response = ApiResponse.paginated(
                'Raw environments retrieved successfully',
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

    async search(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { q, page = 1, limit = 10 } = req.query;

            if (!q || q.trim().length === 0) {
                return res.sendApiResponse(ApiResponse.badRequest('Search query is required'));
            }

            const paginationOptions = {
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 10,
            };

            const result = await this.service.search(q, orgId, paginationOptions);

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

    async getByWorkspace(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { workspaceId } = req.params;

            const result = await this.service.findByWorkspace(workspaceId, orgId);
            res.sendApiResponse(ApiResponse.success('Workspace environments retrieved successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async getOne(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;

            const result = await this.service.findOne(id, orgId);
            res.sendApiResponse(ApiResponse.success('Raw environment retrieved successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async update(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;

            const result = await this.service.update(id, req.body, orgId);
            res.sendApiResponse(ApiResponse.success('Raw environment updated successfully', result));
        } catch (error) {
            next(error);
        }
    }

    async delete(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { id } = req.params;

            await this.service.delete(id, orgId);
            res.sendApiResponse(ApiResponse.success('Raw environment deleted successfully'));
        } catch (error) {
            next(error);
        }
    }

    async bulkDelete(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { environmentIds } = req.body;

            const result = await this.service.bulkDelete(environmentIds, orgId);
            res.sendApiResponse(
                ApiResponse.success(
                    `${result.deletedCount} raw environments deleted successfully`,
                    result
                )
            );
        } catch (error) {
            next(error);
        }
    }
}

const controller = new RawEnvironmentController();

export const {
    create,
    getAll,
    getOne,
    update,
    delete: deleteEnvironment,
    search,
    getByWorkspace,
    bulkDelete,
} = controller;