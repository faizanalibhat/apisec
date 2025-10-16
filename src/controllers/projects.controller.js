import { Projects } from "../models/projects.model.js";
import { PostmanCollections } from "../models/postman-collections.model.js";
import RawRequest from '../models/rawRequest.model.js';



export class ProjectController {

    static getProjects = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const [projects, total] = await Promise.all(
            Projects.find({ orgId }).sort({ createdAt: -1 }).skip((page-1) * limit).limit(limit).lean(),
            Projects.countDocuments({ orgId })
        );

        return res.json({ data: projects, total });
    }

    static createProject = async (req, res, next) => {
        const { orgId, _id, firstName, lastName, email } = req.authenticatedService;

        let project = req.body;

        const owner = {
            name: firstName + " " + lastName,
            email,
            userId: _id,
            role: "owner"
        };

        project.collaborators = [owner];

        const created = await Projects.create({ orgId, ...project });

        const collectionUids = project.collectionUids;

        // add the id to collections & raw requests
        await PostmanCollections.updateMany({ collectionUid: { $in: collectionUids }}, { $push: { projectIds: created._id } });

        // add the id to collections & raw requests
        await RawRequest.updateMany({ collectionUid: { $in: collectionUids }}, { $push: { projectIds: created._id } });

        return res.json(created);
    }

    static updateProject = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { projectId } = req.params;

        const updates = req.body;

        const updated = await Projects.updateMany({ orgId, _id: projectId }, { $set: updates }, { new: true });

        return res.json(updated);
    }

    static addCollection = async (req, res, next) => {

        const { orgId } = req.authenticatedService;
        const { projectId } = req.params;

        const { collectionUid } = req.body;

        const updated = await Projects.updateMany({ orgId, _id: projectId }, { $push: { collectionUids: collectionUid } }, { new: true });

        // add the id to collections & raw requests
        await PostmanCollections.updateMany({ collectionUid: collectionUid }, { $push: { projectIds: created._id } });

        // add the id to collections & raw requests
        await RawRequest.updateMany({ collectionUid: collectionUid }, { $push: { projectIds: created._id } });

        return res.json(updated);
    }

    static removeCollection = async (req, res, next) => {

        const { orgId } = req.authenticatedService;
        const { projectId } = req.params;

        const { collectionUid } = req.body;

        const updated = await Projects.updateMany({ orgId, _id: projectId }, { $pull: { collectionUids: collectionUid } }, { new: true });

        // add the id to collections & raw requests
        await PostmanCollections.updateMany({ collectionUid: collectionUid }, { $pull: { projectIds: created._id } });

        // add the id to collections & raw requests
        await RawRequest.updateMany({ collectionUid: collectionUid }, { $pull: { projectIds: created._id } });

        return res.json(updated);
    }


    static deleteCollection = async (req, res, next) => {

        const { orgId } = req.authenticatedService;
        const { projectId } = req.params;

        const updated = await Projects.findOneAndDelete({ orgId, _id: projectId });

        const collectionUids = updated.collectionUids;

        // add the id to collections & raw requests
        await PostmanCollections.updateMany({ collectionUid: { $in: collectionUids } }, { $pull: { projectIds: created._id } });

        // add the id to collections & raw requests
        await RawRequest.updateMany({ collectionUid: { $in: collectionUids } }, { $pull: { projectIds: created._id } });

        return res.json(updated);
    }
}