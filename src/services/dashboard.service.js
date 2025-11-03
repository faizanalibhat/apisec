import Rule from '../models/rule.model.js';
import RawRequest from '../models/rawRequest.model.js';
import Scan from '../models/scan.model.js';
import Vulnerability from '../models/vulnerability.model.js';
import { ApiError } from '../utils/ApiError.js';
import { resolveCweToType } from '../utils/cwe.util.js';

class DashboardService {
    // Convert period string to date
    getPeriodStartDate(period) {
        const now = new Date();
        const value = parseInt(period.slice(0, -1));
        const unit = period.slice(-1);

        switch (unit) {
            case 'd': // days
                now.setDate(now.getDate() - value);
                break;
            case 'h': // hours
                now.setHours(now.getHours() - value);
                break;
            case 'm': // months
                now.setMonth(now.getMonth() - value);
                break;
            default:
                throw new Error('Invalid period unit');
        }

        return now;
    }

    async getDashboardStats(orgId, period) {
        try {
            const startDate = this.getPeriodStartDate(period);

            // Execute all queries in parallel for performance
            const [
                totalRequests,
                totalVulns,
                totalRules,
                totalScans,
                vulnTimeline,
                topVulns,
                vulnBySeverity,
                vulnByCWE,
                vulnByStatus
            ] = await Promise.all([
                this.getTotalRequests(orgId),
                this.getTotalVulnerabilities(orgId),
                this.getTotalRules(orgId),
                this.getTotalScans(orgId),
                this.getVulnerabilityTimeline(orgId, startDate),
                this.getTopVulnerabilities(orgId),
                this.getVulnerabilitiesBySeverity(orgId),
                this.getVulnerabilitiesByCWE(orgId),
                this.getVulnerabilitiesByStatus(orgId)
            ]);

            return {
                totalRequests,
                totalVulns,
                totalRules,
                totalScans,
                vulnTimeline,
                topVulns,
                vulnBySeverity,
                vulnByCWE,
                vulnByStatus
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getTotalRequests(orgId) {
        return await RawRequest.countDocuments({ orgId });
    }

    async getTotalVulnerabilities(orgId) {
        return await Vulnerability.countDocuments({ orgId });
    }

    async getTotalRules(orgId) {
        return await Rule.countDocuments({ orgId });
    }

    async getTotalScans(orgId) {
        return await Scan.countDocuments({ orgId });
    }

    async getVulnerabilityTimeline(orgId, startDate) {
        const timeline = await Vulnerability.aggregate([
            {
                $match: {
                    orgId,
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt'
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            },
            {
                $project: {
                    date: '$_id',
                    count: 1,
                    _id: 0
                }
            }
        ]);

        // Fill in missing dates with zero counts
        const filledTimeline = this.fillTimelineGaps(timeline, startDate);
        return filledTimeline;
    }

    fillTimelineGaps(timeline, startDate) {
        const endDate = new Date();
        const dateMap = new Map(timeline.map(item => [item.date, item.count]));
        const result = [];

        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            result.push({
                date: dateStr,
                count: dateMap.get(dateStr) || 0
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return result;
    }

    async getTopVulnerabilities(orgId) {
        const topVulns = await Vulnerability.find({
            orgId,
            status: 'active'
        })
        .sort({ severity: 1, createdAt: -1 }) // Sort by severity (critical first) then by date
        .limit(5)
        // .populate('ruleId', 'ruleName category')
        // .populate('requestId', 'name url method collectionName')
        // .populate('transformedRequestId', 'method url')
        .lean();

        // console.log("rule: ", topVulns.map(vuln => vuln.ruleId));
        // console.log("request: ", topVulns.map(vuln => vuln.requestId));
        // console.log("transformed req: ", topVulns.map(vuln => vuln.transformedRequestId));

        // Map severity to numeric value for proper sorting
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
        
        return topVulns.sort((a, b) => {
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0) return severityDiff;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }

    async getVulnerabilitiesBySeverity(orgId) {
        const severityAgg = await Vulnerability.aggregate([
            { $match: { orgId } },
            {
                $group: {
                    _id: '$severity',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Convert to object format and ensure all severities are present
        const severityMap = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            informational: 0
        };

        severityAgg.forEach(item => {
            if (item._id && severityMap.hasOwnProperty(item._id)) {
                severityMap[item._id] = item.count;
            }
        });

        return severityMap;
    }

    async getVulnerabilitiesByCWE(orgId) {
        const cweAgg = await Vulnerability.aggregate([
            {
                $match: {
                    orgId,
                    cwe: { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$cwe',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10 // Top 10 CWEs
            }
        ]);

        // Resolve CWE names in parallel
        const resolvedCwes = await Promise.all(cweAgg.map(async (item) => {
            const name = await resolveCweToType(item._id);
            return {
                cwe: item._id,
                name: name,
                count: item.count
            };
        }));

        return resolvedCwes;
    }

    async getVulnerabilitiesByStatus(orgId) {
        const statusAgg = await Vulnerability.aggregate([
            { $match: { orgId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Convert to object format and ensure all statuses are present
        const statusMap = {
            active: 0,
            resolved: 0,
            false_positive: 0,
            accepted_risk: 0
        };

        statusAgg.forEach(item => {
            if (item._id && statusMap.hasOwnProperty(item._id)) {
                statusMap[item._id] = item.count;
            }
        });

        // Simplify to open/closed for the UI
        return {
            open: statusMap.active + statusMap.accepted_risk,
            closed: statusMap.resolved + statusMap.false_positive
        };
    }

    // Common error handler for service
    handleError(error) {
        // Mongoose validation error
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(e => ({
                field: e.path,
                message: e.message
            }));
            throw ApiError.validationError('Validation failed', errors);
        }

        // Invalid MongoDB ID
        if (error.name === 'CastError') {
            throw ApiError.badRequest('Invalid ID format');
        }

        // If it's already an ApiError, just throw it
        if (error instanceof ApiError) {
            throw error;
        }

        // Unknown error
        console.error('Dashboard service error:', error);
        throw ApiError.internal('An unexpected error occurred');
    }
}

export { DashboardService };