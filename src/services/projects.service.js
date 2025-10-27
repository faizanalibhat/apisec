import { Projects } from '../models/projects.model.js';
import { PostmanCollections } from '../models/postman-collections.model.js';
import RawRequest from '../models/rawRequest.model.js';
import { ApiError } from '../utils/ApiError.js';
import mongoose from 'mongoose';

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
      const { _id, orgId: _, createdAt, updatedAt, collectionUids, ...validUpdateData } = updateData;

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
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        const project = await Projects.findOneAndDelete(
          { _id: projectId, orgId },
          { session }
        );

        if (!project) {
          throw ApiError.notFound('Project not found');
        }

        // Remove project ID from collections and raw requests
        if (project.collectionUids?.length > 0) {
          await this.updateCollectionsAndRequests(
            project.collectionUids, 
            project._id, 
            'remove',
            session
          );
        }

        // Remove project ID from all browser extension requests
        await RawRequest.updateMany(
          { 
            projectIds: project._id,
            source: 'browser-extension'
          },
          { $pull: { projectIds: project._id } },
          { session }
        );
      });

      return { message: 'Project deleted successfully' };
    } catch (error) {
      this.handleError(error);
    } finally {
      await session.endSession();
    }
  }

  async addCollection(projectId, orgId, collectionUid) {
    const session = await mongoose.startSession();
    
    try {
      let project;
      
      await session.withTransaction(async () => {
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
        project = await Projects.findOneAndUpdate(
          { _id: projectId, orgId },
          { $push: { collectionUids: collectionUid } },
          { new: true, session }
        );

        if (!project) {
          throw ApiError.notFound('Project not found');
        }

        // Update collections and raw requests
        await this.updateCollectionsAndRequests([collectionUid], project._id, 'add', session);
      });

      return project;
    } catch (error) {
      this.handleError(error);
    } finally {
      await session.endSession();
    }
  }

  async removeCollection(projectId, orgId, collectionUid) {
    const session = await mongoose.startSession();
    
    try {
      let project;
      
      await session.withTransaction(async () => {
        project = await Projects.findOneAndUpdate(
          { _id: projectId, orgId },
          { $pull: { collectionUids: collectionUid } },
          { new: true, session }
        );

        if (!project) {
          throw ApiError.notFound('Project not found');
        }

        // Update collections and raw requests
        await this.updateCollectionsAndRequests([collectionUid], project._id, 'remove', session);
      });

      return project;
    } catch (error) {
      this.handleError(error);
    } finally {
      await session.endSession();
    }
  }

  // Helper method to update collections and raw requests
  async updateCollectionsAndRequests(collectionUids, projectId, action, session = null) {
    const updateOperation = action === 'add' 
      ? { $push: { projectIds: projectId } }
      : { $pull: { projectIds: projectId } };

    const options = session ? { session } : {};

    // Update PostmanCollections
    await PostmanCollections.updateMany(
      { collectionUid: { $in: collectionUids } },
      updateOperation,
      options
    );

    // Update RawRequests
    await RawRequest.updateMany(
      { collectionUid: { $in: collectionUids } },
      updateOperation,
      options
    );
  }

  handleError(error) {
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