import { Projects } from '../models/projects.model.js';
import { PostmanCollections } from '../models/postman-collections.model.js';
import RawRequest from '../models/rawRequest.model.js';
import Rule from '../models/rule.model.js';
import { ApiError } from '../utils/ApiError.js';
import mongoose from 'mongoose';
// import Vulnerability from '../models/vulnerability.model.js';
// import Scan from '../models/scan.model.js';
// const { ObjectId } = mongoose.Types;

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

            // Create the project
            const project = await Projects.create({
                orgId,
                ...restData,
                collectionUids
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

            // Remove project ID from collections and raw requests
            if (project.collectionUids?.length > 0) {
                await this.updateCollectionsAndRequests(
                    project.collectionUids,
                    project._id,
                    'remove'
                );
            }

            // Remove project ID from all browser extension requests
            await RawRequest.updateMany(
                {
                    projectIds: project._id,
                    source: 'browser-extension'
                },
                { $pull: { projectIds: project._id } }
            );

            return { message: 'Project deleted successfully' };
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

            // Get all active organization rules
            const allRules = await Rule.find({
                orgId,
                isActive: true
            }).lean();

            // Apply rule filtering logic
            let effectiveRules;

            if (project.includedRuleIds && project.includedRuleIds.length > 0) {
                // Whitelist approach - only use included rules
                effectiveRules = allRules.filter(rule =>
                    project.includedRuleIds.some(id => id.toString() === rule._id.toString())
                );
            } else {
                // Use all rules minus excluded ones
                effectiveRules = allRules.filter(rule =>
                    !project.excludedRuleIds?.some(id => id.toString() === rule._id.toString())
                );
            }

            return effectiveRules;
        } catch (error) {
            this.handleError(error);
        }
    }

    async updateRuleSettings(projectId, orgId, ruleData) {
        try {
            const { includedRuleIds, excludedRuleIds, modifiedBy } = ruleData;

            // Validate that rule IDs exist and belong to organization
            if (includedRuleIds && includedRuleIds.length > 0) {
                const validIncludedRules = await Rule.countDocuments({
                    _id: { $in: includedRuleIds },
                    orgId
                });

                if (validIncludedRules !== includedRuleIds.length) {
                    throw ApiError.badRequest('Some included rule IDs are invalid or do not belong to your organization');
                }
            }

            if (excludedRuleIds && excludedRuleIds.length > 0) {
                const validExcludedRules = await Rule.countDocuments({
                    _id: { $in: excludedRuleIds },
                    orgId
                });

                if (validExcludedRules !== excludedRuleIds.length) {
                    throw ApiError.badRequest('Some excluded rule IDs are invalid or do not belong to your organization');
                }
            }

            // Update project with new rule settings
            const updateData = {
                'scanSettings.lastModifiedBy': modifiedBy,
                'scanSettings.lastModifiedAt': new Date()
            };

            if (includedRuleIds !== undefined) {
                updateData.includedRuleIds = includedRuleIds;
            }

            if (excludedRuleIds !== undefined) {
                updateData.excludedRuleIds = excludedRuleIds;
            }

            const project = await Projects.findOneAndUpdate(
                { _id: projectId, orgId },
                { $set: updateData },
                { new: true, runValidators: true }
            ).lean();

            if (!project) {
                throw ApiError.notFound('Project not found');
            }

            // Return project with rule count statistics
            const effectiveRules = await this.getEffectiveRules(projectId, orgId, modifiedBy);

            return {
                ...project,
                ruleStats: {
                    effectiveRuleCount: effectiveRules.length,
                    includedCount: project.includedRuleIds?.length || 0,
                    excludedCount: project.excludedRuleIds?.length || 0
                }
            };
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