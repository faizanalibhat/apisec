import Rule from '../models/rule.model.js';
import RawRequest from '../models/rawRequest.model.js';
import Scan from '../models/scan.model.js';
import { Projects } from '../models/projects.model.js';
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
            // Execute all queries in parallel for performance
            const [
                totalProjects,
                activeScanProjects,
                totalVulns,
                vulnBySeverity,
                projectVulnDist,
                topVulns
            ] = await Promise.all([
                this.getTotalProjects(orgId),
                this.getActiveScanProjectsCount(orgId),
                this.getTotalVulnerabilities(orgId),
                this.getVulnerabilitiesBySeverity(orgId),
                this.getProjectVulnerabilityDistribution(orgId),
                this.getTopVulnerabilities(orgId),
            ]);

            return {
                metrics: {
                    total_applications: totalProjects,
                    applications_with_active_scans: activeScanProjects,
                    total_vulns: totalVulns,
                    total_critical: vulnBySeverity.critical || 0
                },
                distribution_by_severity: vulnBySeverity,
                project_vuln_distribution: projectVulnDist,
                top_vulns: topVulns
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

    async getTotalProjects(orgId) {
        return await Projects.countDocuments({ orgId });
    }

    async getActiveScanProjectsCount(orgId) {
        const projectIds = await Scan.distinct('projectId', {
            orgId,
            status: { $in: ['running', 'pending'] }
        });
        return projectIds.length;
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
            .populate('projectId', 'name')
            .lean();

        // Sort by severity manually since we want a custom order
        // Severity enum is ['critical', 'high', 'medium', 'low', 'info']
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

        topVulns.sort((a, b) => {
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0) return severityDiff;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        // Take top 5 after sorting
        const limitedVulns = topVulns.slice(0, 5);

        return limitedVulns.map(v => {
            // Determine endpoint from requestDetails or evidence
            let endpoint = '';
            if (v.requestDetails && v.requestDetails.url) {
                endpoint = v.requestDetails.url;
            } else if (v.evidence && v.evidence.request && v.evidence.request.url) {
                endpoint = v.evidence.request.url;
            }

            // Determine application name (projectId is active array)
            const appName = (v.projectId && v.projectId.length > 0 && v.projectId[0].name)
                ? v.projectId[0].name
                : 'Unknown';

            return {
                title: v.title,
                description: v.description,
                severity: v.severity,
                createdAt: v.createdAt,
                application_name: appName,
                endpoint: endpoint,
                cvss: v.cvss
            };
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
            info: 0
        };

        severityAgg.forEach(item => {
            if (item._id && severityMap.hasOwnProperty(item._id)) {
                severityMap[item._id] = item.count;
            }
        });

        return severityMap;
    }

    async getProjectVulnerabilityDistribution(orgId) {
        const dist = await Vulnerability.aggregate([
            { $match: { orgId } },
            { $unwind: "$projectId" },
            {
                $group: {
                    _id: { projectId: "$projectId", severity: "$severity" },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: "$_id.projectId",
                    severities: {
                        $push: {
                            k: "$_id.severity",
                            v: "$count"
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "projects",
                    localField: "_id",
                    foreignField: "_id",
                    as: "project"
                }
            },
            { $unwind: "$project" },
            {
                $project: {
                    name: "$project.name",
                    counts: { $arrayToObject: "$severities" }
                }
            }
        ]);

        return dist.map(d => ({
            name: d.name,
            critical: d.counts.critical || 0,
            high: d.counts.high || 0,
            medium: d.counts.medium || 0,
            low: d.counts.low || 0,
            info: d.counts.info || 0
        }));
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

        // Convert to object format (original format)
        const cweMap = {};
        cweAgg.forEach(item => {
            cweMap[item._id] = item.count;
        });

        return cweMap;
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