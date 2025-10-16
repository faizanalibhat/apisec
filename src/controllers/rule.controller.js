import { RuleService } from '../services/rule.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import yaml from "js-yaml";


class RuleController {
    constructor() {
        this.ruleService = new RuleService();
        
        // Bind methods to maintain context
        this.createRule = this.createRule.bind(this);
        this.getRules = this.getRules.bind(this);
        this.getRule = this.getRule.bind(this);
        this.updateRule = this.updateRule.bind(this);
        this.deleteRule = this.deleteRule.bind(this);
        this.searchRules = this.searchRules.bind(this);
    }

    async createRule(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
            const raw_yaml = req.body;

            const json_parsed = yaml.load(raw_yaml);

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
            const { page = 1, limit = 20, isActive, search } = req.query;

            const filters = {};
            filters.$and = [];

            if (search) {
                filters.$and.push({
                    $or: [
                        { rule_name: { $regex: search, $options: 'i' } }
                    ]
                })
            }


            const result = await this.ruleService.getRules({
                orgId,
                filters,
                page: parseInt(page),
                limit: parseInt(limit),
                isActive
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

            const json_parsed = yaml.load(raw_yaml);

            const ruleData = { ...json_parsed, orgId, raw_yaml: raw_yaml, parsed_yaml: json_parsed };

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
}

// Create instance
const ruleController = new RuleController();

export const {
    createRule,
    getRules,
    getRule,
    updateRule,
    deleteRule,
    searchRules
} = ruleController;