import Rule from '../models/rule.model.js';
import { ApiError } from '../utils/ApiError.js';
import fs from "fs";
import yaml from "js-yaml";
import ProjectsService from './projects.service.js';


// const default_yaml_content = fs.readFileSync("src/data/data.yaml");



class RuleService {
    async createRule(ruleData) {
        try {
            // Check if rule with same name exists for organization
            // const existingRule = await Rule.findOne({
            //     orgId: ruleData.orgId,
            //     ruleName: ruleData.ruleName
            // });

            // if (existingRule) {
            //     throw ApiError.conflict('Rule with this name already exists');
            // }

            const rule = new Rule(ruleData);
            await rule.save();

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async getRules({ orgId, filters, page, limit, isActive, projectId, withVulnCount }) {
        try {
            const query = { orgId, ...filters };

            // Filter by active status if provided
            if (isActive !== undefined) {
                query.isActive = isActive === 'true';
            }

            // Handle severity filter
            if (filters.severity) {
                const severities = Array.isArray(filters.severity)
                    ? filters.severity
                    : filters.severity.split(',').map(s => s.trim().toLowerCase());

                query['report.severity'] = { $in: severities };
                delete query.severity;
            }

            const skip = (page - 1) * limit;

            let project = null;
            if (projectId) {
                const projectService = new ProjectsService();
                project = await projectService.findById(projectId, orgId);
            }

            let rules;
            const total = await Rule.countDocuments(query);

            // Get available filters stats
            const [distinctSeverities] = await Promise.all([
                Rule.distinct('report.severity', { orgId })
            ]);

            if (withVulnCount) {
                const pipeline = [
                    { $match: query },
                    {
                        $lookup: {
                            from: 'vulnerabilities',
                            localField: '_id',
                            foreignField: 'ruleSnapshot._id',
                            as: 'vulnerabilities'
                        }
                    },
                    {
                        $addFields: {
                            vulnerabilityCount: { $size: '$vulnerabilities' }
                        }
                    },
                    {
                        $project: {
                            vulnerabilities: 0
                        }
                    },
                    { $sort: { createdAt: -1 } },
                    { $skip: skip },
                    { $limit: limit }
                ];
                rules = await Rule.aggregate(pipeline);
            } else {
                rules = await Rule.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();
            }

            const data = rules.map(rule => {
                const isInProject = project ? project.includedRuleIds.some(id => id.toString() === rule._id.toString()) : false;
                return { ...rule, isInProject };
            });

            return {
                data,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                },
                filters: {
                    severity: distinctSeverities || []
                }
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getRulesSummary({ orgId, filters, page, limit, isActive }) {
        try {
            const query = { orgId, ...filters };

            if (isActive !== undefined) {
                query.isActive = isActive === 'true';
            }

            const skip = (page - 1) * limit;

            const total = await Rule.countDocuments(query);

            const pipeline = [
                { $match: query },
                {
                    $lookup: {
                        from: 'vulnerabilities',
                        localField: '_id',
                        foreignField: 'ruleSnapshot._id',
                        as: 'vulnerabilities'
                    }
                },
                {
                    $addFields: {
                        vulnerabilityCount: { $size: '$vulnerabilities' }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        rule_name: 1,
                        vulnerabilityCount: 1
                    }
                },
                { $sort: { rule_name: 1 } },
                { $skip: skip },
                { $limit: limit }
            ];

            const rules = await Rule.aggregate(pipeline);

            return {
                data: rules,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                }
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getRule(ruleId, orgId) {
        try {
            const rule = await Rule.findOne({
                _id: ruleId,
                orgId
            }).lean();

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async updateRule(ruleId, newRule, orgId) {
        try {

            const rule = await Rule.findOneAndUpdate(
                { _id: ruleId, orgId },
                newRule,
                { new: true }
            );

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteRule(ruleId, orgId) {
        try {
            const rule = await Rule.findOneAndDelete({
                _id: ruleId,
                orgId
            });

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async searchRules({ orgId, searchQuery, page, limit }) {
        try {
            const skip = (page - 1) * limit;

            // Text search on indexed fields
            const query = {
                orgId,
                $text: { $search: searchQuery }
            };

            const [rules, total] = await Promise.all([
                Rule.find(query, { score: { $meta: 'textScore' } })
                    .sort({ score: { $meta: 'textScore' } })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Rule.countDocuments(query)
            ]);

            return {
                data: rules,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                    searchQuery
                }
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async updateRuleStatus(ruleId, isActive, orgId) {
        try {
            const rule = await Rule.findOneAndUpdate(
                { _id: ruleId, orgId },
                { $set: { isActive } },
                { new: true }
            );

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
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

        // MongoDB duplicate key error
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            throw ApiError.conflict(`${field} already exists`);
        }

        // If it's already an ApiError, just throw it
        if (error instanceof ApiError) {
            throw error;
        }

        // Unknown error
        console.error('Service error:', error);
        throw ApiError.internal('An unexpected error occurred');
    }
}

export { RuleService };