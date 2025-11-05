import { Projects } from '../models/projects.model.js';
import { PostmanCollections } from '../models/postman-collections.model.js';
import RawRequest from '../models/rawRequest.model.js';
import Vulnerability from '../models/vulnerability.model.js';
import Rule from '../models/rule.model.js';
import { ApiError } from '../utils/ApiError.js';
import mongoose from 'mongoose';
import { getPeriodStartDate, getStateDistribution, getSeverityDistribution, getTotalVulnerabilities, getTotalResolvedVulnerabilities, getTotalRawRequests, getTotalTransformedRequests, getTotalRules, getActiveRulesCount } from '../helpers/project.js';

const { ObjectId } = mongoose.Types;

class ProjectsService {
    
    async findAll(orgId, search, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            let query = { orgId };

            // Add search functionality
            if (search && search.trim()) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            const [projects, totalItems] = await Promise.all([
                Projects.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Projects.countDocuments(query)
            ]);

            return {
                data: projects,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async findById(projectId, orgId) {
        try {
            const project = await Projects.findOne({
                _id: projectId,
                orgId
            }).lean();

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            return project;
        } catch (error) {
            this.handleError(error);
        }
    }

    async create(orgId, projectData) {
        try {
            const { collectionUids = [], ...restData } = projectData;

            // Find all active rules for the organization
            const activeRules = await Rule.find({ orgId, isActive: true }).select('_id').lean();
            const activeRuleIds = activeRules.map(rule => rule._id);

            // Create the project
            const project = await Projects.create({
                orgId,
                ...restData,
                collectionUids,
                includedRuleIds: activeRuleIds // Set all active rules by default
            });

            // Update collections and raw requests with project ID
            if (collectionUids.length > 0) {
                await this.updateCollectionsAndRequests(collectionUids, project._id, 'add');
            }

            return project.toObject();
        } catch (error) {
            this.handleError(error);
        }
    }

    async update(projectId, orgId, updateData) {
        try {
            // Remove fields that shouldn't be updated
            const {
                _id,
                orgId: _,
                createdAt,
                updatedAt,
                collectionUids,
                includedRuleIds,
                excludedRuleIds,
                ...validUpdateData
            } = updateData;

            const project = await Projects.findOneAndUpdate(
                { _id: projectId, orgId },
                { $set: validUpdateData },
                { new: true, runValidators: true }
            ).lean();

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            return project;
        } catch (error) {
            this.handleError(error);
        }
    }

    async delete(projectId, orgId) {
        try {
            const project = await Projects.findOneAndDelete({
                _id: projectId,
                orgId
            });

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            // Delete all raw requests associated with this project
            await RawRequest.deleteMany({
                projectIds: project._id
            });

            await Vulnerability.deleteMany({
                projectId: project._id
            });

            return { message: 'Project deleted successfully' };
        } catch (error) {
            this.handleError(error);
        }
    }

    async getProjectDashboard(projectId, orgId, period) {
        try {
            const startDate = getPeriodStartDate(period);

            // Get project details first, as it's needed for active rule calculation
            const project = await this.findById(projectId, orgId);

            // Execute all queries in parallel for performance
            const [
                stateDistribution,
                severityDistribution,
                totalVulns,
                totalResolved,
                totalRawRequests,
                totalTransformedRequests,
                totalRules
            ] = await Promise.all([
                getStateDistribution(projectId, orgId, startDate),
                getSeverityDistribution(projectId, orgId, startDate),
                getTotalVulnerabilities(projectId, orgId, startDate),
                getTotalResolvedVulnerabilities(projectId, orgId, startDate),
                getTotalRawRequests(projectId, orgId),
                getTotalTransformedRequests(projectId, orgId),
                getTotalRules(orgId)
            ]);

            // Calculate active rules for the project
            const totalActiveRules = getActiveRulesCount(project, totalRules);

            // Calculate remediation percentage
            const remediation = totalVulns > 0
                ? Math.round((totalResolved / totalVulns) * 100)
                : 0;

            return {
                state_distribution: stateDistribution,
                severity_distribution: severityDistribution,
                remediation,
                totalVulns,
                totalResolved,
                totalRawRequests,
                totalTransformedRequests,
                totalRules,
                totalActiveRules
            };
        } catch (error) {
            this.handleError(error);
        }
    }


    async addCollection(projectId, orgId, collectionUid) {
        try {
            // Check if collection already exists in project
            const existingProject = await Projects.findOne({
                _id: projectId,
                orgId,
                collectionUids: collectionUid
            });

            if (existingProject) {
                throw ApiError.conflict('Collection already exists in this project');
            }

            // Add collection to project
            const project = await Projects.findOneAndUpdate(
                { _id: projectId, orgId },
                { $push: { collectionUids: collectionUid } },
                { new: true }
            );

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            // Update collections and raw requests
            await this.updateCollectionsAndRequests([collectionUid], project._id, 'add');

            return project;
        } catch (error) {
            this.handleError(error);
        }
    }

    async removeCollection(projectId, orgId, collectionUid) {
        try {
            const project = await Projects.findOneAndUpdate(
                { _id: projectId, orgId },
                { $pull: { collectionUids: collectionUid } },
                { new: true }
            );

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            // Update collections and raw requests
            await this.updateCollectionsAndRequests([collectionUid], project._id, 'remove');

            return project;
        } catch (error) {
            this.handleError(error);
        }
    }

    // Rule management methods
    async getEffectiveRules(projectId, orgId, userEmail) {
        try {
            const project = await this.findById(projectId, orgId);

            // Get all active organization rules that are in the project's included list
            const effectiveRules = await Rule.find({
                orgId,
                isActive: true,
                _id: { $in: project.includedRuleIds || [] }
            }).lean();

            return effectiveRules;
        } catch (error) {
            this.handleError(error);
        }
    }

    async updateRuleSettings(projectId, orgId, ruleData) {
        try {
            const { ruleId, action: active, modifiedBy } = ruleData;

            // Find the project first to check its current state
            const project = await this.findById(projectId, orgId);

            // Prevent removal of the last rule
            if (!active) { // If deactivating a rule
                const isLastRule = project.includedRuleIds.length === 1 && project.includedRuleIds[0].toString() === ruleId;
                if (isLastRule) {
                    throw ApiError.badRequest('A project must have at least one active rule. You cannot remove the last rule.');
                }
            }

            // Validate that rule ID exists and belongs to organization
            if (ruleId) {
                const validRule = await Rule.countDocuments({
                    _id: ruleId,
                    orgId
                });

                if (validRule !== 1) {
                    throw ApiError.badRequest('Rule ID is invalid or does not belong to your organization');
                }
            }

            const updateOperation = active
            ? { $addToSet: { includedRuleIds: ruleId } }
            : { $pull: { includedRuleIds: ruleId } };

            // Update project with new rule settings
            const updateData = {
                ...updateOperation,
            };
            
            updateData['$set'] = {
                'scanSettings.lastModifiedBy': modifiedBy,
                'scanSettings.lastModifiedAt': new Date()
            }


            const updatedProject = await Projects.findOneAndUpdate(
                { _id: projectId, orgId },
                updateData,
                { new: true, runValidators: true }
            ).lean();

            if (!updatedProject) {
                throw ApiError.notFound('Project not found');
            }

            // Return project with rule count statistics
            const effectiveRules = await this.getEffectiveRules(projectId, orgId, modifiedBy);

            return {
                ...updatedProject,
                ruleStats: {
                    effectiveRuleCount: effectiveRules.length,
                    includedCount: updatedProject.includedRuleIds?.length || 0,
                    excludedCount: updatedProject.excludedRuleIds?.length || 0
                }
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async toggleCollectionStatus(projectId, orgId, isCollecting) {
        try {
            const project = await Projects.findOneAndUpdate(
                { _id: projectId, orgId },
                { $set: { isCollecting } },
                { new: true, runValidators: true }
            ).lean();

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            return project;
        } catch (error) {
            this.handleError(error);
        }
    }

    // Helper method to update collections and raw requests
    async updateCollectionsAndRequests(collectionUids, projectId, action) {
        const updateOperation = action === 'add'
            ? { $push: { projectIds: projectId } }
            : { $pull: { projectIds: projectId } };

        // Update PostmanCollections
        await PostmanCollections.updateMany(
            { collectionUid: { $in: collectionUids } },
            updateOperation
        );

        // Update RawRequests
        await RawRequest.updateMany(
            { collectionUid: { $in: collectionUids } },
            updateOperation
        );

        // get all raw requests and then move their vulns to projects as well
        const rawRequests = await RawRequest.find({ collectionUid: { $in: collectionUids } });

        const Ids = rawRequests.map(request => request._id);

        const vulnUpdate = action == 'add' ? { $addToSet: { projectId: projectId } } : { $pull: { projectId: projectId } };

        await Vulnerability.updateMany({ 'requestSnapshot._id': { $in: Ids } }, vulnUpdate);
    }

    handleError(error) {
        console.error('Original error:', error);
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message
            }));
            throw ApiError.validationError('Validation failed', errors);
        }

        if (error.name === 'CastError') {
            throw ApiError.badRequest('Invalid ID format');
        }

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            throw ApiError.conflict(`Duplicate value for ${field}`);
        }

        if (error instanceof ApiError) {
            throw error;
        }

        throw ApiError.internal('An error occurred while processing the project operation');
    }

}

export default ProjectsService;