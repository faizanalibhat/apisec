import ProjectsService from '../../services/projects.service.js';
import { Projects } from '../../models/projects.model.js';
import Scan from '../../models/scan.model.js';
import RawRequestService from '../../services/rawRequest.service.js';
import RawRequest from '../../models/rawRequest.model.js';
import TransformedRequest from '../../models/transformedRequest.model.js';
import { RuleService } from '../../services/rule.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import mongoose from 'mongoose';
import { mqbroker } from '../../services/rabbitmq.service.js';


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
        this.toggleCollectionStatus = this.toggleCollectionStatus.bind(this);
        this.configureProject = this.configureProject.bind(this);
        this.uploadAuthScript = this.uploadAuthScript.bind(this);
        this.updateScanSetting = this.updateScanSetting.bind(this);
        this.getScanHistory = this.getScanHistory.bind(this);
        this.executeScan = this.executeScan.bind(this);
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

    async getProjectDashboard(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;
            const { period = '7d' } = req.query;

            // Validate period format
            const validPeriodPattern = /^\d+[dhm]$/;
            if (!validPeriodPattern.test(period)) {
                throw ApiError.badRequest('Invalid period format. Use format like 7d, 30d, 24h, 3m');
            }

            // Get project details first
            const project = await this.projectsService.findById(projectId, orgId);

            // Get dashboard data
            const dashboardData = await this.projectsService.getProjectDashboard(
                projectId,
                orgId,
                period
            );

            res.sendApiResponse(
                ApiResponse.success('Project dashboard statistics fetched successfully', {
                    name: project.name,
                    ...dashboardData
                })
            );
        } catch (error) {
            next(error);
        }
    }

    async toggleCollectionStatus(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;
            const { isCollecting } = req.body;

            const project = await this.projectsService.toggleCollectionStatus(projectId, orgId, isCollecting);
            res.sendApiResponse(ApiResponse.success('Project collection status updated successfully', project));
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
                isActive: 'true',
                projectId
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
            const { ruleId, active } = req.body;

            if (typeof active !== 'boolean') {
                throw ApiError.badRequest('Active must be a boolean value');
            }

            if (!ruleId) {
                throw ApiError.badRequest('Rule ID is required');
            }

            const updatedProject = await this.projectsService.updateRuleSettings(
                projectId,
                orgId,
                {
                    ruleId,
                    action: active,
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
            const { projectId, orgId } = req.params;
            const browserData = req.body;

            console.log("[+] BROWSER REQUEST RECEIVED: ", browserData.request?.request?.method, browserData.request?.request?.url?.raw);

            // Verify project exists
            const project = await this.projectsService.findById(projectId, orgId);

            if (!project) {
                console.log("[+] PROJECT DOES NOT EXIST ", projectId);
                throw ApiError.notFound('Project not found');
            }

            // Transform browser extension data to raw request format
            const rawRequestData = this.transformBrowserRequest(browserData, project, orgId, projectId);

            // Generate a unique identifier for this request within the project
            const requestSignature = `${rawRequestData.method}:${rawRequestData.url}`;

            // Check for existing request with same signature in this project
            const existingRequest = await RawRequest.findOne({
                orgId,
                method: rawRequestData.method,
                url: rawRequestData.url,
                projectIds: projectId,
                source: 'browser-extension'
            });

            if (existingRequest) {

                return res.sendApiResponse(ApiResponse.success('Request already exists in project (duplicate ignored)', {
                    _id: existingRequest._id,
                    status: 'duplicate',
                    message: 'Request already exists, no new scan triggered'
                }));
            }

            // Create new request
            const newRequest = await RawRequest.create(rawRequestData);
            console.log(`[+] Created new request: ${newRequest._id} for project ${projectId}`);

            // Add a small delay to prevent race conditions
            await new Promise(resolve => setTimeout(resolve, 100));

            // Double-check that we haven't already triggered a scan for this request
            const existingTransformations = await TransformedRequest.countDocuments({
                requestId: newRequest._id,
                // projectId: [projectId],
                projectId: [new mongoose.Types.ObjectId(projectId)]
            });

            if (existingTransformations > 0) {
                console.log(`[!] Transformations already exist for request ${newRequest._id}, not publishing event`);
                res.sendApiResponse(ApiResponse.created('Browser request created successfully (scan already in progress)', newRequest));
                return;
            }

            // Publish event to trigger scan
            const eventPayload = {
                projectId,
                orgId,
                request: newRequest.toJSON(),
                project: project,
                source: 'request.created',
                timestamp: Date.now() // Add timestamp for tracking
            };

            await mqbroker.publish('apisec', 'apisec.request.created', eventPayload);
            console.log(`[+] Published request.created event for request ${newRequest._id} in project ${projectId}`);

            res.sendApiResponse(ApiResponse.created('Browser request created successfully', newRequest));
        } catch (error) {
            next(error);
        }
    }

    async bulkCreateBrowserRequests(req, res, next) {
        try {
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
                failed: [],
                skipped: []
            };

            for (const [index, browserData] of requests.entries()) {
                try {
                    const rawRequestData = this.transformBrowserRequest(browserData, project, orgId, projectId);

                    // Check for duplicate within this project
                    const existingRequest = await RawRequest.findOne({
                        orgId,
                        method: rawRequestData.method,
                        url: rawRequestData.url,
                        projectIds: ObjectId.createFromHexString(projectId)
                    });

                    if (existingRequest) {
                        results.skipped.push({
                            index,
                            id: existingRequest._id,
                            status: 'duplicate',
                            message: 'Request already exists in project'
                        });
                        console.log(`[+] Skipped duplicate request for project ${projectId}`);
                    } else {
                        // Create new request
                        const newRequest = await RawRequest.create(rawRequestData);
                        results.success.push({ index, id: newRequest._id, status: 'created' });

                        // Publish event to trigger scan
                        const eventPayload = {
                            projectId,
                            orgId,
                            request: newRequest.toJSON(),
                            project: project,
                            source: 'request.created'
                        };

                        await mqbroker.publish('apisec', 'apisec.request.created', eventPayload);
                        console.log(`[+] Published request.created event for project ${projectId}`);
                    }

                } catch (error) {
                    results.failed.push({
                        index,
                        error: error.message,
                        data: browserData
                    });
                }
            }

            const createdCount = results.success.filter(r => r.status === 'created').length;
            const skippedCount = results.skipped.length;

            res.sendApiResponse(ApiResponse.success(
                `Processed ${requests.length} requests: ${createdCount} created, ${skippedCount} skipped (duplicates), ${results.failed.length} failed`,
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

        // Prepare the request data object
        const requestData = {
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

        // Generate and add rawHttp field
        requestData.rawHttp = this.rawRequestService.generateRawHttp({
            method: requestData.method,
            url: requestData.url,
            headers: requestData.headers,
            body: requestData.body
        });

        return requestData;
    }

    // setup controller
    async configureProject(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            const { collectionUids, owner, ...configuration } = req.body;

            const project = await Projects.findOne({ _id: projectId, orgId });

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            project.configuration = configuration;
            project.collectionUids = collectionUids;
            project.owner = owner;

            await project.save();

            res.sendApiResponse(ApiResponse.success('Project updated successfully', project));
        } catch (error) {
            next(error);
        }
    }

    async uploadAuthScript(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            const project = await Projects.findOne({ _id: projectId, orgId });

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            const file = req.uploadedFiles[0];

            if (!file) {
                throw ApiError.badRequest('No file uploaded');
            }

            project.authScript = file;
            await project.save();

            res.sendApiResponse(ApiResponse.success('Auth script uploaded successfully', project));
        } catch (error) {
            next(error);
        }
    }

    async updateScanSetting(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            const project = await Projects.findOne({ _id: projectId, orgId });

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            const scanSettings = req.body;

            project.scanSettings = scanSettings;

            await project.save();

            res.sendApiResponse(ApiResponse.success('Scan settings updated successfully', project));
        } catch (error) {
            next(error);
        }
    }

    async executeScan(req, res, next) {

        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            const project = await Projects.findOne({ _id: projectId, orgId });

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            // create a scan for this in pending state
            const scan = new Scan({
                orgId,
                projectId,
                status: 'pending',
            });

            await scan.save();

            await mqbroker.publish("apisec", "apisec.project.scan.launched", { project, scan });

            res.sendApiResponse(ApiResponse.success('Scan started successfully'));
        } catch (error) {
            next(error);
        }
    }

    async getScanHistory(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { projectId } = req.params;

            const project = await Projects.findOne({ _id: projectId, orgId });

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            const scans = await Scan.find({ projectId });

            res.sendApiResponse(ApiResponse.success('Scan history', scans));
        } catch (error) {
            next(error);
        }
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
    getProjectDashboard,
    toggleCollectionStatus,
    configureProject,
    uploadAuthScript,
    updateScanSetting,
    getScanHistory,
    executeScan
} = controller;