import Scan from '../models/scan.model.js';
import Rule from '../models/rule.model.js';
import RawRequest from '../models/rawRequest.model.js';
import RawEnvironment from '../models/rawEnvironment.model.js';
import TransformedRequest from '../models/transformedRequest.model.js';
import { Projects } from '../models/projects.model.js';
import ProjectsService from './projects.service.js';
import { ApiError } from '../utils/ApiError.js';
import { TransformerService } from './transformer.service.js';
import { mqbroker } from './rabbitmq.service.js';

export class ScanService {

    constructor() {
        this.transformerService = new TransformerService();
        this.projectsService = new ProjectsService();
    }

    async createScan(scanData) {
        try {
            const { name, description, ruleIds, requestIds, environmentId, collectionIds, orgId, projectIds, scope, authProfileId } = scanData;

            // Check if this is a project-based scan (only projectId provided)
            const isProjectBasedScan = projectIds && projectIds.length === 1 && 
                                     !requestIds && !collectionIds && !ruleIds;

            let rules;
            let requests;
            let actualProjectIds = projectIds;

            if (isProjectBasedScan) {
                // Project-based scan flow
                const projectId = projectIds[0];
                
                // Get project and verify it exists
                const project = await this.projectsService.findById(projectId, orgId);
                
                // Get effective rules for the project
                rules = await this.projectsService.getEffectiveRules(projectId, orgId, 'system');
                
                if (rules.length === 0) {
                    throw ApiError.badRequest('No rules are configured for this project. Please configure rules before scanning.');
                }

                // Get browser extension requests for this project
                requests = await RawRequest.find({
                    orgId,
                    projectIds: projectId,
                    source: 'browser-extension'
                }).lean();

                if (requests.length === 0) {
                    throw ApiError.badRequest('No browser requests found for this project. Please import requests first.');
                }

                // Update scan name if not provided
                if (!scanData.name) {
                    scanData.name = `${project.name} - Security Scan`;
                }
            } else {
                // Traditional scan flow (existing logic)
                
                // Validate environment if provided
                if (environmentId && environmentId?.length) {
                    const environment = await RawEnvironment.findOne({
                        _id: { $in: environmentId },
                        orgId
                    });

                    if (!environment) {
                        throw ApiError.badRequest('Invalid environment ID provided');
                    }
                }

                // Validate rules exist
                if (ruleIds && ruleIds?.length) {
                    rules = await Rule.find({
                        _id: { $in: ruleIds },
                        orgId
                    }).lean();
                } else {
                    rules = await Rule.find({ orgId }).lean();
                }

                // Build request filter
                const filter = { orgId };

                if (requestIds && requestIds.length > 0) {
                    filter._id = { $in: requestIds };
                }

                if (collectionIds && collectionIds.length > 0) {
                    filter.collectionUid = { $in: collectionIds };
                }

                if (projectIds && projectIds.length > 0) {
                    filter.projectIds = { $in: projectIds };
                }

                console.log("[+] APPLIED FILTER: ", filter);

                // Get all requests for the organization
                requests = await RawRequest.find(filter).lean();

                if (requests.length === 0) {
                    throw ApiError.badRequest('No requests found for scanning. Please import requests first.');
                }
            }

            // Create scan document
            const scan = await Scan.create({
                name,
                description,
                orgId,
                scope,
                ruleIds: rules.map(r => r._id),
                requestIds: requests.map(r => r._id),
                collectionIds,
                environmentId,
                authProfileId,
                projectIds: actualProjectIds,
                isProjectBasedScan,
                status: 'pending',
                stats: {
                    totalRequests: requests.length,
                    totalRules: rules.length,
                    totalTransformedRequests: requests.length * rules.length
                }
            });

            // Send Scan Start notification
            try {
                const scanStartNotification = {
                    store: true,
                    orgId: orgId,
                    notification: {
                        title: "Scan Started",
                        description: `Scan "${scan.name}" has been initiated with ${requests.length} requests and ${rules.length} rules.`,
                        resourceUrl: `/scans/${scan._id}`,
                        origin: "aim",
                        resourceMeta: {
                            product: "aim",
                            action: "scan_start",
                            resource: "scan",
                            scanType: isProjectBasedScan ? "project-based" : "traditional"
                        }
                    },
                    authContext: scanData.authContext || 'system'
                };

                await mqbroker.publish("notification", "notification", scanStartNotification);
            } catch (notificationError) {
                console.error('Failed to send scan start notification:', notificationError);
                // Don't throw - continue with scan creation
            }

            // Publish scan to queue
            await mqbroker.publish("apisec", "apisec.scan.create", scan);

            // Send to VM notification
            try {
                const scanTypeDescription = isProjectBasedScan ? 
                    "project-based security testing" : 
                    "security testing";
                    
                const sendToVMNotification = {
                    store: true,
                    orgId: orgId,
                    channels: ["email"],
                    notification: {
                        title: "Scan Queued for Processing",
                        description: `Scan "${scan.name}" has been queued for ${scanTypeDescription}.`,
                        resourceUrl: `/scans/${scan._id}`,
                        origin: "aim",
                        resourceMeta: {
                            product: "aim",
                            action: "scan_queued",
                            resource: "scan"
                        }
                    },
                    context: {
                        name: scanData.userName || "User",
                        title: "Scan Queued for Processing",
                        description: `Your scan "${scan.name}" has been successfully queued and will begin processing shortly. You will receive another notification when the scan completes.`,
                        status: "success",
                        timestamp: Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
                        action_text: "Monitor Progress",
                        action_url: `https://suite.snapsec.co/scans/${scan._id}`,
                        base_url: "https://suite.snapsec.co",
                        subject: "Scan Processing Started - Snapsec"
                    },
                    orgCoverage: { roles: ["Member"] },
                    authContext: scanData.authContext || 'system'
                };

                await mqbroker.publish("notification", "notification", sendToVMNotification);
            } catch (notificationError) {
                console.error('Failed to send VM queue notification:', notificationError);
                // Don't throw - continue with scan creation
            }

            return scan;
        } catch (error) {
            this.handleError(error);
        }
    }

    async createProjectScanInstance(scanData) {
        try {
            const { name, status = "running", description, ruleIds, requestIds, environmentId, collectionIds, orgId, projectIds, scope, authProfileId } = scanData;

            // Check if this is a project-based scan (only projectId provided)
            const isProjectBasedScan = true;

            let rules;
            let requests;
            let actualProjectIds = projectIds;

            // Project-based scan flow
            const projectId = projectIds[0];
            
            // Get project and verify it exists
            const project = await this.projectsService.findById(projectId, orgId);
            
            // Get effective rules for the project
            rules = await this.projectsService.getEffectiveRules(projectId, orgId, 'system');
            
            if (rules.length === 0) {
                throw ApiError.badRequest('No rules are configured for this project. Please configure rules before scanning.');
            }

            // Get browser extension requests for this project
            requests = await RawRequest.find({
                orgId,
                _id: { $in: requestIds },
                source: 'browser-extension'
            }).lean();

            if (requests.length === 0) {
                throw ApiError.badRequest('No browser requests found for this project. Please import requests first.');
            }

            // Update scan name if not provided
            // if (!scanData.name) {
            //     scanData.name = `${project.name} - Security Scan`;
            // }

            const exists = await Scan.findOne({ orgId, name });

            if (!exists) {
                // Create scan document
                const scan = await Scan.findOneAndUpdate({ orgId, name }, {
                    name,
                    description,
                    orgId,
                    scope,
                    ruleIds: rules.map(r => r._id),
                    $push: { requestIds: requests.map(r => r._id) },
                    collectionIds,
                    environmentId,
                    authProfileId,
                    projectIds: actualProjectIds,
                    isProjectBasedScan,
                    status,
                    'stats.totalRules': rules.length,
                    $inc: { 'stats.totalRequests': 1, 'stats.totalTransformedRequests': requests.length * rules.length },
                }, { upsert: true, new: true });


                return scan;
            }
            else {
                const scan = await Scan.findOneAndUpdate({ orgId, name }, {
                    name,
                    description,
                    orgId,
                    scope,
                    ruleIds: rules.map(r => r._id),
                    $push: { requestIds: requests.map(r => r._id) },
                    collectionIds,
                    environmentId,
                    authProfileId,
                    projectIds: actualProjectIds,
                    isProjectBasedScan,
                    'stats.totalRules': rules.length,
                    $inc: { 'stats.totalRequests': 1, 'stats.totalTransformedRequests': requests.length * rules.length },
                }, { upsert: true, new: true });

                return scan;
            }

        } catch (error) {
            this.handleError(error);
        }
    }

    async startScanProcess(scanId, rules, requests) {
        // Update scan status to running
        const scan = await Scan.findByIdAndUpdate(scanId, {
            status: 'running',
            startedAt: new Date()
        });

        try {
            await mqbroker.publish("apisec", "apisec.scan.run", scan);
        } catch (error) {
            throw error; // Will be caught by parent catch
        }
    }

    async getScans(options) {
        try {
            const { page, limit, status, sortBy, order, orgId, search } = options;

            const query = { orgId };
            if (status) {
                query.status = status;
            }

            if (search) {
                query.$text = { $search: search };
            }

            const sortKeyMap = {
                'rules': 'stats.totalRules',
                'progress': 'completedRequests',
                'vulnerabilities': 'vulnerabilitySummary.total',
                'createdAt': 'createdAt',
                'name': 'name',
                'status': 'status'
            };

            const sortField = sortKeyMap[sortBy] || 'createdAt';
            const sort = {};

            if (search) {
                sort.score = { $meta: 'textScore' };
            } else {
                sort[sortField] = order === 'asc' ? 1 : -1;
            }

            const total = await Scan.countDocuments(query);
            const pages = Math.ceil(total / limit);
            const skip = (page - 1) * limit;

            const pipeline = [
                // 1. Match query filters
                { $match: query },

                // 2. Lookup environment name
                {
                    $lookup: {
                        from: "environments",
                        localField: "environmentId",
                        foreignField: "_id",
                        as: "environment"
                    }
                },
                { $unwind: { path: "$environment", preserveNullAndEmptyArrays: true } },
                
                // 3. Lookup project details for project-based scans
                {
                    $lookup: {
                        from: "projects",
                        localField: "projectIds",
                        foreignField: "_id",
                        as: "projects"
                    }
                },
                
                // 4. Lookup transformed requests for each scan
                {
                    $lookup: {
                        from: "transformedrequests",
                        localField: "_id",
                        foreignField: "scanId",
                        as: "transformedRequests"
                    }
                },
                
                // 5. Lookup raw requests based on requestIds
                {
                    $lookup: {
                        from: "raw_requests",
                        localField: "requestIds",
                        foreignField: "_id",
                        as: "rawRequests"
                    }
                },

                // 6. Lookup rules based on ruleIds
                {
                    $lookup: {
                        from: "rules",
                        localField: "ruleIds",
                        foreignField: "_id",
                        as: "rules"
                    }
                },

                // 7. Compute counts and override stats
                {
                    $addFields: {
                        completedRequests: {
                            $size: {
                                $filter: {
                                    input: "$transformedRequests",
                                    as: "req",
                                    cond: { $in: ["$$req.state", ["complete", "failed"]] }
                                }
                            }
                        },
                        totalRequests: { $size: "$transformedRequests" },
                        environmentId: "$environment._id",
                        environmentName: "$environment.name",
                        projectNames: {
                            $map: {
                                input: "$projects",
                                as: "project",
                                in: "$$project.name"
                            }
                        },
                        // Override stats values with actual counts
                        "stats.totalRequests": { $size: "$rawRequests" },
                        "stats.totalRules": { $size: "$rules" },
                        "stats.totalTransformedRequests": { $size: "$transformedRequests" },
                        "vulnerabilitySummary.total": {
                            $add: [
                                { $ifNull: ["$vulnerabilitySummary.critical", 0] },
                                { $ifNull: ["$vulnerabilitySummary.high", 0] },
                                { $ifNull: ["$vulnerabilitySummary.medium", 0] },
                                { $ifNull: ["$vulnerabilitySummary.low", 0] }
                            ]
                        }
                    }
                },

                // 8. Remove the lookup arrays to avoid large payloads
                {
                    $project: {
                        transformedRequests: 0,
                        rawRequests: 0,
                        rules: 0,
                        findings: 0,
                        projects: 0
                    }
                },

                // 9. Sort, skip, limit
                { $sort: sort },
                { $skip: skip },
                { $limit: limit }
            ];

            if (search) {
                pipeline.splice(1, 0, { $addFields: { score: { $meta: 'textScore' } } });
            }

            const scans = await Scan.aggregate(pipeline);

            return {
                data: scans,
                page,
                limit,
                total,
                pages
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getScan(scanId, orgId) {
        try {
            const scan = await Scan.findOne({
                _id: scanId,
                orgId
            })
                .populate('ruleIds', 'rule_name description report.severity')
                .populate('requestIds', 'name method url source')
                .populate('environmentId', 'name workspaceName')
                .populate('projectIds', 'name description')
                .lean();

            if (!scan) {
                throw ApiError.notFound('Scan not found');
            }

            // Add total to vulnerabilitySummary
            if (scan.vulnerabilitySummary) {
                const { critical = 0, high = 0, medium = 0, low = 0 } = scan.vulnerabilitySummary;
                scan.vulnerabilitySummary.total = critical + high + medium + low;
            }

            // Add additional metadata for project-based scans
            if (scan.isProjectBasedScan && scan.projectIds && scan.projectIds.length > 0) {
                const project = scan.projectIds[0];
                scan.projectInfo = {
                    name: project.name,
                    description: project.description,
                    scanType: 'project-based'
                };
            }

            return scan;
        } catch (error) {
            this.handleError(error);
        }
    }

    async getScanFindings(scanId, orgId, options) {
        try {
            const { page, limit, severity } = options;

            const scan = await Scan.findOne({
                _id: scanId,
                orgId
            }).select('findings');

            if (!scan) {
                throw ApiError.notFound('Scan not found');
            }

            let findings = scan.findings;

            // Filter by severity if provided
            if (severity) {
                findings = findings.filter(f => f.vulnerability.severity === severity);
            }

            // Paginate findings
            const total = findings.length;
            const pages = Math.ceil(total / limit);
            const skip = (page - 1) * limit;
            const paginatedFindings = findings.slice(skip, skip + limit);

            return {
                data: paginatedFindings,
                page,
                limit,
                total,
                pages
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteScan(scanId, orgId) {
        try {
            const scan = await Scan.findOne({
                _id: scanId,
                orgId
            });

            if (!scan) {
                throw ApiError.notFound('Scan not found');
            }

            // Cancel if scan is running
            if (scan.isActive) {
                await Scan.findByIdAndUpdate(scanId, {
                    status: 'cancelled',
                    cancelledAt: new Date()
                });
            }

            // Delete all transformed requests associated with this scan
            await TransformedRequest.deleteMany({ scanId });

            // Delete the scan
            await Scan.findByIdAndDelete(scanId);

            return { message: 'Scan deleted successfully' };
        } catch (error) {
            this.handleError(error);
        }
    }

    async rescan(originalScanId, orgId) {
        try {
            const originalScan = await Scan.findOne({
                _id: originalScanId,
                orgId
            }).lean();

            if (!originalScan) {
                throw ApiError.notFound('Original scan not found');
            }

            // Create a formatted timestamp
            const now = new Date();
            const day = now.toLocaleDateString('en-US', { weekday: 'short' });
            const dayOfMonth = now.getDate();
            const month = now.toLocaleDateString('en-US', { month: 'short' });
            const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const [hh, mm, ss] = time.split(':');
            const formattedTimestamp = `${day}, ${dayOfMonth} ${month}, ${hh},${mm},${ss}`;
    
            // Remove old rescan prefix to get the base name
            const baseName = originalScan.name.replace(/^\[Rescan.*?\]\\s*/, '');

            // Preserve scan data based on scan type
            const scanData = {
                name: `[Rescan <${formattedTimestamp}>] ${baseName}`,
                description: `Rescan of "${originalScan.name}" initiated on ${new Date().toISOString()}`,
                orgId: originalScan.orgId,
                scope: originalScan.scope,
                originalScanId: originalScan._id
            };

            // For project-based scans, only include projectId
            if (originalScan.isProjectBasedScan && originalScan.projectIds && originalScan.projectIds.length > 0) {
                scanData.projectIds = originalScan.projectIds;
            } else {
                // For traditional scans, include all original parameters
                scanData.ruleIds = originalScan.ruleIds;
                scanData.requestIds = originalScan.requestIds;
                scanData.environmentId = originalScan.environmentId;
                scanData.collectionIds = originalScan.collectionIds;
                scanData.projectIds = originalScan.projectIds;
            }

            return await this.createScan(scanData);
        } catch (error) {
            this.handleError(error);
        }
    }

    handleError(error) {
        console.error('ScanService Error:', error);

        if (error.name === 'CastError') {
            throw ApiError.badRequest('Invalid ID format');
        }

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            throw ApiError.validationError('Validation failed', messages);
        }

        if (error instanceof ApiError) {
            throw error;
        }

        throw ApiError.internal('An error occurred while processing scan operation');
    }
}