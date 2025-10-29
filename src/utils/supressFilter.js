import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;

export function supressFilter(rules = [], suppress) {
  if (!rules.length) {
    return suppress ? { _id: { $in: [] } } : {};
  }

  const conditions = rules.map(rule => ({
    "requestSnapshot._id": ObjectId.createFromHexString(rule.requestId),
    "ruleSnapshot._id": ObjectId.createFromHexString(rule.ruleI),
  }));

  // If suppress = true, return items that *match* these rules
  if (suppress) return { $and: conditions };

  // Otherwise, return items that *do not match* these rules
  return { $nor: conditions };
}
