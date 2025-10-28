import ProjectsService from '../services/projects.service.js';
import RawRequestService from '../services/rawRequest.service.js';
import { RuleService } from '../services/rule.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import mongoose from 'mongoose';
import { mqbroker } from '../services/rabbitmq.service.js';
const { ObjectId } = mongoose.Types;

class ProjectsController {
    constructor() {
        this.projectsService = new ProjectsService();
        this.rawRequestService = new RawRequestService();
        this.ruleService = new RuleService();

        // Bind all methods
        this.getProjects = this.getProjects.bind(this);
        this.getProject = this.getProject.bind(this);
        this.createProject = this.createProject.bind(this);
        this.updateProject = this.updateProject.bind(this);
        this.deleteProject = this.deleteProject.bind(this);
        this.addCollection = this.addCollection.bind(this);
        this.removeCollection = this.removeCollection.bind(this);
        this.getProjectRules = this.getProjectRules.bind(this);
        this.getEffectiveRules = this.getEffectiveRules.bind(this);
        this.updateProjectRules = this.updateProjectRules.bind(this);
        this.getBrowserRequests = this.getBrowserRequests.bind(this);
        this.createBrowserRequest = this.createBrowserRequest.bind(this);
        this.bulkCreateBrowserRequests = this.bulkCreateBrowserRequests.bind(this);
        this.getBrowserRequest = this.getBrowserRequest.bind(this);
        this.updateBrowserRequest = this.updateBrowserRequest.bind(this);
        this.deleteBrowserRequest = this.deleteBrowserRequest.bind(this);
        this.getProjectDashboard = this.getProjectDashboard.bind(this);
    }

    async getProjectDashboard(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            const dashboardData = await this.projectsService.getProjectDashboard(
                projectId, 
                orgId
            );

            res.sendApiResponse(ApiResponse.success(
                'Project dashboard data retrieved successfully', 
                dashboardData
            ));
        } catch (error) {
            next(error);
        }
    }

    async getProjects(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { page = 1, limit = 10, search } = req.query;

            const paginationOptions = {
                page: parseInt(page),
                limit: parseInt(limit)
            };

            const result = await this.projectsService.findAll(orgId, search, paginationOptions);

            const response = ApiResponse.paginated(
                'Projects retrieved successfully',
                result.data,
                {
                    currentPage: result.currentPage,
                    totalPages: result.totalPages,
                    totalItems: result.totalItems,
                    itemsPerPage: result.itemsPerPage
                }
            );

            res.sendApiResponse(response);
        } catch (error) {
            next(error);
        }
    }

    async getProject(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            const project = await this.projectsService.findById(projectId, orgId);
            res.sendApiResponse(ApiResponse.success('Project retrieved successfully', project));
        } catch (error) {
            next(error);
        }
    }

    async createProject(req, res, next) {
        try {
            const { orgId, _id, firstName, lastName, email } = req.authenticatedService;

            const projectData = {
                ...req.body,
                collaborators: [{
                    name: `${firstName} ${lastName}`,
                    email,
                    userId: _id,
                    role: 'owner'
                }]
            };

            const project = await this.projectsService.create(orgId, projectData);
            res.sendApiResponse(ApiResponse.created('Project created successfully', project));
        } catch (error) {
            next(error);
        }
    }

    async updateProject(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            const project = await this.projectsService.update(projectId, orgId, req.body);
            res.sendApiResponse(ApiResponse.success('Project updated successfully', project));
        } catch (error) {
            next(error);
        }
    }

    async deleteProject(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            await this.projectsService.delete(projectId, orgId);
            res.sendApiResponse(ApiResponse.success('Project deleted successfully'));
        } catch (error) {
            next(error);
        }
    }

    async addCollection(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;
            const { collectionUid } = req.body;

            const project = await this.projectsService.addCollection(projectId, orgId, collectionUid);
            res.sendApiResponse(ApiResponse.success('Collection added successfully', project));
        } catch (error) {
            next(error);
        }
    }

    async removeCollection(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;
            const { collectionUid } = req.body;

            const project = await this.projectsService.removeCollection(projectId, orgId, collectionUid);
            res.sendApiResponse(ApiResponse.success('Collection removed successfully', project));
        } catch (error) {
            next(error);
        }
    }

    // Rule management methods
    async getProjectRules(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            // Get project to see current rule configuration
            const project = await this.projectsService.findById(projectId, orgId);

            // Get all organization rules
            const allRules = await this.ruleService.getRules({
                orgId,
                filters: {},
                page: 1,
                limit: 1000, // Get all rules
                isActive: 'true'
            });

            const response = {
                project: {
                    id: project._id,
                    name: project.name,
                    includedRuleIds: project.includedRuleIds || [],
                    excludedRuleIds: project.excludedRuleIds || []
                },
                availableRules: allRules.data,
                stats: {
                    totalRules: allRules.data.length,
                    includedCount: project.includedRuleIds?.length || 0,
                    excludedCount: project.excludedRuleIds?.length || 0
                }
            };

            res.sendApiResponse(ApiResponse.success('Project rules retrieved successfully', response));
        } catch (error) {
            next(error);
        }
    }

    async getEffectiveRules(req, res, next) {
        try {
            const { orgId, email: userEmail } = req.authenticatedService;
            const { projectId } = req.params;

            const effectiveRules = await this.projectsService.getEffectiveRules(projectId, orgId, userEmail);

            res.sendApiResponse(ApiResponse.success('Effective rules calculated successfully', {
                rules: effectiveRules,
                count: effectiveRules.length
            }));
        } catch (error) {
            next(error);
        }
    }

    async updateProjectRules(req, res, next) {
        try {
            const { orgId, email: userEmail } = req.authenticatedService;
            const { projectId } = req.params;
            const { includedRuleIds, excludedRuleIds } = req.body;

            const updatedProject = await this.projectsService.updateRuleSettings(
                projectId,
                orgId,
                {
                    includedRuleIds,
                    excludedRuleIds,
                    modifiedBy: userEmail
                }
            );

            res.sendApiResponse(ApiResponse.success('Project rules updated successfully', updatedProject));
        } catch (error) {
            next(error);
        }
    }

    // Browser request methods
    async getBrowserRequests(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;
            const {
                page = 1,
                limit = 10,
                search,
                sort,
                method
            } = req.query;

            // Verify project exists
            await this.projectsService.findById(projectId, orgId);

            // Build filters for raw requests
            const filters = {
                orgId,
                projectIds: ObjectId.createFromHexString(projectId),
                source: 'browser-extension'
            };

            if (method) {
                filters.method = { $in: method.split(',').map(m => m.toUpperCase()) };
            }

            // Parse sort parameter
            let sortOptions = { createdAt: -1 };
            if (sort) {
                const [field, order] = sort.split(':');
                const allowedSortFields = ['createdAt', 'method', 'name', 'url'];
                if (allowedSortFields.includes(field)) {
                    sortOptions = { [field]: order === 'asc' ? 1 : -1 };
                }
            }

            const paginationOptions = {
                page: parseInt(page),
                limit: parseInt(limit)
            };

            let result;
            if (search && search.trim().length > 0) {
                result = await this.rawRequestService.searchWithFiltersAndSort(
                    search,
                    filters,
                    sortOptions,
                    paginationOptions
                );
            } else {
                result = await this.rawRequestService.findAllWithSort(
                    filters,
                    sortOptions,
                    paginationOptions
                );
            }

            const response = ApiResponse.paginated(
                'Browser requests retrieved successfully',
                result.data,
                {
                    currentPage: result.currentPage,
                    totalPages: result.totalPages,
                    totalItems: result.totalItems,
                    itemsPerPage: result.itemsPerPage
                }
            );

            res.sendApiResponse(response);
        } catch (error) {
            next(error);
        }
    }

    async createBrowserRequest(req, res, next) {
        try {
            // const { orgId } = req.authenticatedService;
            const { projectId, orgId } = req.params;
            const browserData = req.body;

            console.log("[+] BROWSER REQUEST RECIEVED: ", browserData);

            // Verify project exists and get its name
            const project = await this.projectsService.findById(projectId, orgId);

            // Transform browser extension data to raw request format
            const rawRequestData = this.transformBrowserRequest(browserData, project, orgId, projectId);

            const rawRequest = await this.rawRequestService.create(rawRequestData);

            // Publish event to trigger scan
            const eventPayload = {
                projectId,
                orgId,
                rawRequestId: rawRequest._id,
                source: 'request.created'
            };
            await mqbroker.publish('apisec', 'apisec.request.created', eventPayload);
            console.log(`[+] Published request.created event for project ${projectId}`);

            res.sendApiResponse(ApiResponse.created('Browser request created successfully', rawRequest));
        } catch (error) {
            next(error);
        }
    }

    async bulkCreateBrowserRequests(req, res, next) {
        try {
            // const { orgId } = req.authenticatedService;
            const { projectId, orgId } = req.params;
            const { requests } = req.body;

            if (!Array.isArray(requests) || requests.length === 0) {
                throw ApiError.badRequest('Requests must be a non-empty array');
            }

            // Verify project exists
            const project = await this.projectsService.findById(projectId, orgId);

            // Transform and create requests
            const results = {
                success: [],
                failed: []
            };

            for (const [index, browserData] of requests.entries()) {
                try {
                    const rawRequestData = this.transformBrowserRequest(browserData, project, orgId, projectId);
                    const created = await this.rawRequestService.create(rawRequestData);
                    results.success.push({ index, id: created._id });

                    // Publish event to trigger scan
                    const eventPayload = {
                        projectId,
                        orgId,
                        rawRequestId: created._id,
                        source: 'request.created'
                    };
                    await mqbroker.publish('apisec', 'apisec.request.created', eventPayload);
                    console.log(`[+] Published request.created event for project ${projectId}`);

                } catch (error) {
                    results.failed.push({
                        index,
                        error: error.message,
                        data: browserData
                    });
                }
            }

            res.sendApiResponse(ApiResponse.success(
                `Created ${results.success.length} requests, ${results.failed.length} failed`,
                results
            ));
        } catch (error) {
            next(error);
        }
    }

    async getBrowserRequest(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId, requestId } = req.params;

            // Verify project exists
            await this.projectsService.findById(projectId, orgId);

            // Get the raw request
            const rawRequest = await this.rawRequestService.findOne(requestId, orgId);

            // Verify it belongs to this project and is from browser extension
            const projectIdStrings = rawRequest.projectIds.map(id => id.toString());

            if (!projectIdStrings.includes(projectId) || rawRequest.source !== 'browser-extension') {
                throw ApiError.notFound('Browser request not found in this project');
            }

            res.sendApiResponse(ApiResponse.success('Browser request retrieved successfully', rawRequest));
        } catch (error) {
            next(error);
        }
    }

    async updateBrowserRequest(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId, requestId } = req.params;

            // Verify project exists
            await this.projectsService.findById(projectId, orgId);

            // Get existing request to verify it's a browser request
            const existingRequest = await this.rawRequestService.findOne(requestId, orgId);

            const projectIdStrings = existingRequest.projectIds.map(id => id.toString());

            if (!projectIdStrings.includes(projectId) || existingRequest.source !== 'browser-extension') {
                throw ApiError.notFound('Browser request not found in this project');
            }

            // Update the request
            const updated = await this.rawRequestService.update(requestId, req.body, orgId);
            res.sendApiResponse(ApiResponse.success('Browser request updated successfully', updated));
        } catch (error) {
            next(error);
        }
    }

    async deleteBrowserRequest(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId, requestId } = req.params;

            // Verify project exists
            await this.projectsService.findById(projectId, orgId);

            // Get existing request to verify it's a browser request
            const existingRequest = await this.rawRequestService.findOne(requestId, orgId);

            const projectIdStrings = existingRequest.projectIds.map(id => id.toString());

            if (!projectIdStrings.includes(projectId) || existingRequest.source !== 'browser-extension') {
                throw ApiError.notFound('Browser request not found in this project');
            }

            await this.rawRequestService.delete(requestId, orgId);
            res.sendApiResponse(ApiResponse.success('Browser request deleted successfully'));
        } catch (error) {
            next(error);
        }
    }

    // Helper method to transform browser extension data to raw request format
    transformBrowserRequest(browserData, project, orgId, projectId) {
        const { request, timestamp, tabId } = browserData;
        const { name, request: requestDetails, response } = request;

        // Convert headers array to object
        const headers = {};
        if (Array.isArray(requestDetails.header)) {
            requestDetails.header.forEach(h => {
                headers[h.key] = h.value;
            });
        }

        // Convert query params array to object
        const params = {};
        if (requestDetails.url?.query && Array.isArray(requestDetails.url.query)) {
            requestDetails.url.query.forEach(q => {
                params[q.key] = q.value;
            });
        }

        // Build the full URL
        const url = requestDetails.url?.raw || '';

        return {
            orgId,
            projectIds: [ObjectId.createFromHexString(projectId)],
            source: 'browser-extension',
            name: name || requestDetails.method + ' ' + url,
            method: requestDetails.method || 'GET',
            url,
            headers,
            params,
            body: requestDetails.body,
            body_format: requestDetails.body ? 'json' : null,
            collectionName: project.name,
            workspaceName: project.name,
            description: `Imported from browser extension on ${new Date(timestamp).toISOString()}`,
            browserMetadata: {
                tabId,
                responseStatus: response?.status || response?.code,
                responseHeaders: response?.header || [],
                responseBody: response?.body || '',
                extensionTimestamp: new Date(timestamp).getTime()
            }
        };
    }
}

const controller = new ProjectsController();

export const {
    getProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    addCollection,
    removeCollection,
    getProjectRules,
    getEffectiveRules,
    updateProjectRules,
    getBrowserRequests,
    createBrowserRequest,
    bulkCreateBrowserRequests,
    getBrowserRequest,
    updateBrowserRequest,
    deleteBrowserRequest,
    getProjectDashboard
} = controller;