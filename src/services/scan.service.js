import Scan from '../models/scan.model.js';
import Rule from '../models/rule.model.js';
import RawRequest from '../models/rawRequest.model.js';
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
            const { name, description, ruleIds, requestIds, orgId } = scanData;

            // Validate rules exist
            // const rules = await Rule.find({
            //     _id: { $in: ruleIds },
            //     orgId
            // }).lean();

            // if (rules.length !== ruleIds.length) {
            //     throw ApiError.badRequest('One or more invalid rule IDs provided');
            // }

            // // Get requests - if requestIds provided, use them; otherwise get all
            // let requests;
            // if (requestIds && requestIds.length > 0) {
            //     requests = await RawRequest.find({
            //         _id: { $in: requestIds },
            //         orgId
            //     }).lean();

            //     if (requests.length !== requestIds.length) {
            //         throw ApiError.badRequest('One or more invalid request IDs provided');
            //     }
            // } else {
            //     // Get all requests for the organization
            //     requests = await RawRequest.find({ orgId }).lean();

            //     if (requests.length === 0) {
            //         throw ApiError.badRequest('No requests found for scanning. Please import requests first.');
            //     }
            // }

            // Create scan document
            const scan = await Scan.create({
                name,
                description,
                orgId,
                // ruleIds: rules.map(r => r._id),
                // requestIds: requests.map(r => r._id),
                status: 'pending',
                stats: {
                    // totalRequests: requests.length,
                    // totalRules: rules.length,
                    // totalTransformedRequests: requests.length * rules.length
                }
            });

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

            const scans = await Scan.find(query)
                .select('-findings') // Exclude findings for list view
                .sort(sort)
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

    async getScan(scanId, orgId) {
        try {
            const scan = await Scan.findOne({
                _id: scanId,
                orgId
            })
                .populate('ruleIds', 'ruleName description')
                .populate('requestIds', 'name method url')
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