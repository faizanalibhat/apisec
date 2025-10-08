import Rule from '../models/rule.model.js';
import { ApiError } from '../utils/ApiError.js';

class RuleService {
    async createRule(ruleData) {
        try {
            // Check if rule with same name exists for organization
            const existingRule = await Rule.findOne({
                organizationId: ruleData.organizationId,
                ruleName: ruleData.ruleName
            });

            if (existingRule) {
                throw ApiError.conflict('Rule with this name already exists');
            }

            const rule = new Rule(ruleData);
            await rule.save();

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async getRules({ organizationId, page, limit, isActive }) {
        try {
            const query = { organizationId };

            // Filter by active status if provided
            if (isActive !== undefined) {
                query.isActive = isActive === 'true';
            }

            const skip = (page - 1) * limit;

            const [rules, total] = await Promise.all([
                Rule.find(query)
                    .sort({ createdAt: -1 })
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
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                }
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getRule(ruleId, organizationId) {
        try {
            const rule = await Rule.findOne({
                _id: ruleId,
                organizationId
            }).lean();

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async updateRule(ruleId, updateData, organizationId) {
        try {
            // If changing rule name, check for duplicates
            if (updateData.ruleName) {
                const existingRule = await Rule.findOne({
                    organizationId,
                    ruleName: updateData.ruleName,
                    _id: { $ne: ruleId }
                });

                if (existingRule) {
                    throw ApiError.conflict('Rule with this name already exists');
                }
            }

            // Don't allow organizationId to be updated
            delete updateData.organizationId;

            const rule = await Rule.findOneAndUpdate(
                { _id: ruleId, organizationId },
                updateData,
                { new: true, runValidators: true }
            );

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteRule(ruleId, organizationId) {
        try {
            const rule = await Rule.findOneAndDelete({
                _id: ruleId,
                organizationId
            });

            if (!rule) {
                throw ApiError.notFound('Rule not found');
            }

            return rule;
        } catch (error) {
            this.handleError(error);
        }
    }

    async searchRules({ organizationId, searchQuery, page, limit }) {
        try {
            const skip = (page - 1) * limit;

            // Text search on indexed fields
            const query = {
                organizationId,
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