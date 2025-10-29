export function suppressFilter(rules = [], suppress) {
  if (!rules.length) {
    return suppress ? { _id: { $in: [] } } : {};
  }

  const conditions = rules.map(rule => ({
    "requestSnapshot._id": rule.requestId,
    "ruleSnapshot._id": rule.ruleId
  }));

  // If suppress = true, return items that *match* these rules
  if (suppress) return { $and: conditions };

  // Otherwise, return items that *do not match* these rules
  return { $nor: conditions };
}
