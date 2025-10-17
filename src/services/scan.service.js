import Scan from '../models/scan.model.js';
import Rule from '../models/rule.model.js';
import RawRequest from '../models/rawRequest.model.js';
import RawEnvironment from '../models/rawEnvironment.model.js';
import TransformedRequest from '../models/transformedRequest.model.js';
import { ApiError } from '../utils/ApiError.js';
import { TransformerService } from './transformer.service.js';
import { mqbroker } from './rabbitmq.service.js';

export class ScanService {
    constructor() {
        this.transformerService = new TransformerService();
    }

    async createScan(scanData) {
        try {
            const { name, description, ruleIds, requestIds, environmentId, collectionIds, orgId, projectIds } = scanData;

            // Validate environment if provided
            if (environmentId) {
                const environment = await RawEnvironment.findOne({
                    _id: environmentId,
                    orgId
                });

                if (!environment) {
                    throw ApiError.badRequest('Invalid environment ID provided');
                }
            }

            // Validate rules exist
            let rules;

            if (ruleIds && ruleIds?.length) {
                rules = await Rule.find({
                    _id: { $in: ruleIds },
                    orgId
                }).lean();
            }
            else {
                rules = await Rule.find({ orgId }).lean();
            }

            let requests;

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

            // Get all requests for the organization
            requests = await RawRequest.find(filter).lean();

            if (requests.length === 0) {
                throw ApiError.badRequest('No requests found for scanning. Please import requests first.');
            }

            // Create scan document
            const scan = await Scan.create({
                name,
                description,
                orgId,
                ruleIds: rules.map(r => r._id),
                requestIds: requests.map(r => r._id),
                collectionIds,
                environmentId,
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
                    channels: ["email"],
                    notification: {
                        title: "Scan Started",
                        description: `Scan "${scan.name}" has been initiated with ${requests.length} requests and ${rules.length} rules.`,
                        resourceUrl: `/scans/${scan._id}`,
                        origin: "aim",
                        resourceMeta: {
                            product: "aim",
                            action: "scan_start",
                            resource: "scan"
                        }
                    },
                    context: {
                        name: scanData.userName || "User",
                        title: "Scan Started",
                        description: `Your API security scan "${scan.name}" has been successfully created and is being prepared for execution. The scan will test ${requests.length} API requests against ${rules.length} security rules.`,
                        status: "success",
                        timestamp: Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
                        action_text: "View Scan",
                        action_url: `https://suite.snapsec.co/scans/${scan._id}`,
                        base_url: "https://suite.snapsec.co",
                        subject: "API Security Scan Started - Snapsec"
                    },
                    orgCoverage: { roles: ["Member"] },
                    authContext: scanData.authContext || 'system'
                };

                await mqbroker.publish("notification", "notification", scanStartNotification);
            } catch (notificationError) {
                console.error('Failed to send scan start notification:', notificationError);
                // Don't throw - continue with scan creation
            }

            // Publish scan to queue
            await mqbroker.publish("apisec", "apisec.scan.create", scan);

            // Trigger async transformation process
            // this.startScanProcess(scan._id, rules, requests).catch(error => {
            //   console.error(`Scan ${scan._id} failed:`, error);
            //   // Update scan status to failed
            //   Scan.findByIdAndUpdate(scan._id, {
            //     status: 'failed',
            //     error: {
            //       message: error.message,
            //       stack: error.stack,
            //       occurredAt: new Date()
            //     }
            //   }).exec();
            // });

            // Send to VM notification
            try {
                const sendToVMNotification = {
                    store: true,
                    orgId: orgId,
                    channels: ["email"],
                    notification: {
                        title: "Scan Queued for Processing",
                        description: `Scan "${scan.name}" has been queued for security testing.`,
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

    async startScanProcess(scanId, rules, requests) {
        // Update scan status to running
        const scan = await Scan.findByIdAndUpdate(scanId, {
            status: 'running',
            startedAt: new Date()
        });

        try {
            // Generate and execute transformed requests
            // const findings = await this.transformerService.processTransformations(
            //   scanId,
            //   rules,
            //   requests
            // );

            // // Calculate vulnerability summary
            // const vulnerabilitySummary = findings.reduce((summary, finding) => {
            //   summary[finding.vulnerability.severity]++;
            //   return summary;
            // }, { critical: 0, high: 0, medium: 0, low: 0 });

            // // Update scan with results
            // await Scan.findByIdAndUpdate(scanId, {
            //   status: 'completed',
            //   completedAt: new Date(),
            //   findings,
            //   'stats.vulnerabilitiesFound': findings.length,
            //   vulnerabilitySummary
            // });
            await mqbroker.publish("apisec", "apisec.scan.run", scan);
        } catch (error) {
            throw error; // Will be caught by parent catch
        }
    }

    async getScans(options) {
        try {
            const { page, limit, status, sortBy, order, orgId } = options;

            const query = { orgId };
            if (status) {
                query.status = status;
            }

            const sort = {};
            sort[sortBy] = order === 'asc' ? 1 : -1;

            const total = await Scan.countDocuments(query);
            const pages = Math.ceil(total / limit);
            const skip = (page - 1) * limit;

            const scans = await Scan.aggregate([
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

                // 3. Lookup raw requests using requestIds
                {
                    $lookup: {
                        from: "rawrequests",
                        localField: "requestIds",
                        foreignField: "_id",
                        as: "rawRequests"
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

                // 5. Compute counts
                {
                    $addFields: {
                        completedRequests: {
                            $size: {
                                $filter: {
                                    input: "$transformedRequests",
                                    as: "req",
                                    cond: { $eq: ["$$req.state", "complete"] }
                                }
                            }
                        },
                        totalRequests: { $size: "$transformedRequests" },
                        environmentId: "$environment._id",
                        environmentName: "$environment.name"
                    }
                },

                // 6. Optionally remove the full transformedRequests array, environment array and findings to avoid large payloads
                {
                    $project: {
                        transformedRequests: 0,
                        environment: 0,
                        findings: 0 // same as your `.select('-findings')`
                    }
                },

                // 7. Sort, skip, limit
                { $sort: sort },
                { $skip: skip },
                { $limit: limit }
            ]);

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
                .populate('ruleIds', 'ruleName description')
                .populate('requestIds', 'name method url')
                .populate('environmentId', 'name workspaceName')
                .lean();

            if (!scan) {
                throw ApiError.notFound('Scan not found');
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

    async searchScans(options) {
        try {
            const { search, page, limit, orgId } = options;

            const query = {
                orgId,
                $text: { $search: search }
            };

            const total = await Scan.countDocuments(query);
            const pages = Math.ceil(total / limit);
            const skip = (page - 1) * limit;

            const scans = await Scan.find(query, { score: { $meta: 'textScore' } })
                .select('-findings')
                .populate('environmentId', 'name')
                .sort({ score: { $meta: 'textScore' } })
                .skip(skip)
                .limit(limit)
                .lean();

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