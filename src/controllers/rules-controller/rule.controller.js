import { RuleService } from '../../services/rule.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { mqbroker } from '../../services/rabbitmq.service.js';
import yaml from "js-yaml";


class RuleController {
    constructor() {
        this.ruleService = new RuleService();

        // Bind methods to maintain context
        this.createRule = this.createRule.bind(this);
        this.getRules = this.getRules.bind(this);
        this.getRulesSummary = this.getRulesSummary.bind(this);
        this.getRule = this.getRule.bind(this);
        this.updateRule = this.updateRule.bind(this);
        this.deleteRule = this.deleteRule.bind(this);
        this.searchRules = this.searchRules.bind(this);
        this.updateRuleStatus = this.updateRuleStatus.bind(this);
        this.syncDefaultRules = this.syncDefaultRules.bind(this);
    }

    async createRule(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const raw_yaml = req.body;

            const json_parsed = yaml.load(raw_yaml);

            // --- Start Validation ---
            const { rule_name, report } = json_parsed;
            if (!rule_name) {
                throw ApiError.badRequest('Validation failed: rule_name is required in YAML.');
            }
            if (!report) {
                throw ApiError.badRequest('Validation failed: report object is required in YAML.');
            }
            if (!report.title) {
                throw ApiError.badRequest('Validation failed: report.title is required.');
            }
            if (!report.description) {
                throw ApiError.badRequest('Validation failed: report.description is required.');
            }
            if (!report.severity) {
                throw ApiError.badRequest('Validation failed: report.severity is required.');
            }
            // --- End Validation ---

            const ruleData = { ...json_parsed, orgId, raw_yaml: raw_yaml, parsed_yaml: json_parsed };

            // parse yaml & store both json & yaml

            const rule = await this.ruleService.createRule(ruleData);

            res.sendApiResponse(
                ApiResponse.created('Rule created successfully', rule)
            );
        } catch (error) {
            next(error);
        }
    }

    async getRules(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { page = 1, limit = 20, isActive, search, projectId, withVulnCount } = req.query;

            const filters = {};
            if (search) {
                filters.$and = [
                    {
                        $or: [
                            { rule_name: { $regex: search, $options: 'i' } }
                        ]
                    }
                ];
            }

            const result = await this.ruleService.getRules({
                orgId,
                filters,
                page: parseInt(page),
                limit: parseInt(limit),
                isActive,
                projectId,
                withVulnCount: withVulnCount === 'true'
            });

            res.sendApiResponse(
                ApiResponse.paginated(
                    'Rules fetched successfully',
                    result.data,
                    result.pagination
                )
            );
        } catch (error) {
            next(error);
        }
    }

    async getRulesSummary(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { page = 1, limit = 20, isActive, search } = req.query;

            const filters = {};
            if (search) {
                filters.$and = [
                    {
                        $or: [
                            { rule_name: { $regex: search, $options: 'i' } }
                        ]
                    }
                ];
            }

            const result = await this.ruleService.getRulesSummary({
                orgId,
                filters,
                page: parseInt(page),
                limit: parseInt(limit),
                isActive
            });

            res.sendApiResponse(
                ApiResponse.paginated(
                    'Rules summary fetched successfully',
                    result.data,
                    result.pagination
                )
            );
        } catch (error) {
            next(error);
        }
    }

    async getRule(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { ruleId } = req.params;

            const rule = await this.ruleService.getRule(ruleId, orgId);

            res.sendApiResponse(
                ApiResponse.success('Rule fetched successfully', rule)
            );
        } catch (error) {
            next(error);
        }
    }

    async updateRule(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { ruleId } = req.params;
            const raw_yaml = req.body;

            // Get existing rule to merge with
            const existingRule = await this.ruleService.getRule(ruleId, orgId);
            if (!existingRule) {
                throw ApiError.notFound('Rule not found');
            }

            // Parse new yaml
            const new_json = yaml.load(raw_yaml);

            // Deep merge 'report' object manually
            const merged_report = {
                ...(existingRule.report || {}),
                ...(new_json.report || {})
            };

            // Create the final merged object for the whole rule, ensuring nested objects are merged
            const final_json = {
                ...existingRule.parsed_yaml,
                ...new_json,
                report: merged_report
            };

            // --- Start Validation ---
            const { rule_name, report } = final_json;
            if (!rule_name) {
                throw ApiError.badRequest('Validation failed: rule_name cannot be removed.');
            }
            if (!report) {
                throw ApiError.badRequest('Validation failed: report object cannot be removed.');
            }
            if (!report.title) {
                throw ApiError.badRequest('Validation failed: report.title is required.');
            }
            if (!report.description) {
                throw ApiError.badRequest('Validation failed: report.description is required.');
            }
            if (!report.severity) {
                throw ApiError.badRequest('Validation failed: report.severity is required.');
            }
            // --- End Validation ---

            // Construct the complete data object to save
            const ruleData = {
                ...final_json,
                orgId,
                raw_yaml: raw_yaml, // always use the new raw_yaml
                parsed_yaml: final_json
            };

            const rule = await this.ruleService.updateRule(ruleId, ruleData, orgId);

            res.sendApiResponse(
                ApiResponse.updated('Rule updated successfully', rule)
            );
        } catch (error) {
            next(error);
        }
    }

    async deleteRule(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { ruleId } = req.params;

            const deletedRule = await this.ruleService.deleteRule(ruleId, orgId);

            res.sendApiResponse(
                ApiResponse.deleted('Rule deleted successfully')
            );
        } catch (error) {
            next(error);
        }
    }

    async searchRules(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { search, page = 1, limit = 20 } = req.query;

            if (!search) {
                throw ApiError.badRequest('Search query is required');
            }

            const result = await this.ruleService.searchRules({
                orgId,
                searchQuery: search,
                page: parseInt(page),
                limit: parseInt(limit)
            });

            res.sendApiResponse(
                ApiResponse.paginated(
                    'Search results fetched successfully',
                    result.data,
                    result.pagination
                )
            );
        } catch (error) {
            next(error);
        }
    }

    async updateRuleStatus(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const { ruleId } = req.params;
            const { isActive } = req.body;

            const rule = await this.ruleService.updateRuleStatus(ruleId, isActive, orgId);

            res.sendApiResponse(
                ApiResponse.updated('Rule status updated successfully', rule)
            );
        } catch (error) {
            next(error);
        }
    }


    async syncDefaultRules(req, res, next) {
        const { orgId } = req.authenticatedService;

        await mqbroker.publish("apisec", "apisec.rules.sync", { orgId });

        return res.json({ message: "Sync started" });
    }
}

// Create instance
const ruleController = new RuleController();

export const {
    createRule,
    getRules,
    getRulesSummary,
    getRule,
    updateRule,
    deleteRule,
    searchRules,
    updateRuleStatus,
    syncDefaultRules
} = ruleController;