import { PostmanCollections } from "../models/postman-collections.model"


export class CollectionsController {

    static getCollections = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { search } = req.query;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 1;

        const skip = ((page - 1) * limit)

        const filters = {
            $and: [],
            $or: []
        };

        if (search) {
            filters.$and.push({
                $or: [
                    { name: { $regex: search, $options: 'i' } }
                ]
            });
        }

        const collections = await PostmanCollections.find({ orgId, ...filters })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await PostmanCollections.countDocuments({ orgId });

        return res.json({ data: collections, total: total });
    }
}