import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;

export function supressFilter(rules = [], suppress) {
    if (!rules.length) {
        return {};
    }

    const ruleIds = rules.map(r => ObjectId.createFromHexString(r.ruleId));
    const requestIds = rules.map(r => ObjectId.createFromHexString(r.requestId));

    if (suppress === true || suppress === 'true') {
        return {
            $and: [
                { "ruleSnapshot._id": { $in: ruleIds } },
                { "requestSnapshot._id": { $in: requestIds } }
            ]
        };
    } else if (suppress === false || suppress === 'false') {
        return {
            $and: [
                { "ruleSnapshot._id": { $nin: ruleIds } },
                { "requestSnapshot._id": { $nin: requestIds } }
            ]
        }
    }

    return {};
}
