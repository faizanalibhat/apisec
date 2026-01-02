import { Collections } from "../../models/collections.model.js"


export class CollectionsController {

    static getCollections = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { search } = req.query;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const skip = ((page - 1) * limit)

        const filters = {};

        if (search) {
            filters.$and = [];
            filters.$and.push({
                $or: [
                    { name: { $regex: search, $options: 'i' } }
                ]
            });
        }

        const pipeline = [
            // 1️⃣ Filter by orgId and any other filters
            {
                $match: { orgId, ...filters }
            },

            // 2️⃣ Lookup to count related requests
            {
                $lookup: {
                    from: "raw_requests",
                    let: {
                        collection_uid: "$collection_uid",
                        org_id: "$orgId"
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$collectionUid", "$$collection_uid"] },
                                        { $eq: ["$orgId", "$$org_id"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "requests"
                }
            },

            // 3️⃣ Add totalRequests count
            {
                $addFields: {
                    totalRequests: { $size: "$requests" }
                }
            },

            // 4️⃣ Remove the full "requests" array (optional for performance)
            {
                $project: {
                    requests: 0
                }
            },

            // 5️⃣ Sort by creation time
            {
                $sort: { createdAt: -1 }
            },

            // 6️⃣ Pagination: skip + limit
            {
                $skip: skip
            },
            {
                $limit: limit
            }
        ];


        const collections = await Collections.aggregate(pipeline);

        const total = await Collections.countDocuments({ orgId });

        return res.json({ data: collections, total: total });
    }
}