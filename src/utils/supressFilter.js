export function supressFilter(rules = [], supress) {
    if (!rules.length) {
        // If there are no suppression rules, return an empty object unless we are filtering *for* suppressed items.
        return supress ? { _id: { $in: [] } } : {};
    }

    const suppressionPairs = rules.map(rule => ({
        $and: [
            { "requestSnapshot._id": rule.requestId },
            { "ruleSnapshot._id": rule.ruleId }
        ]
    }));

    if (supress === true || supress === 'true') {
        // Filter FOR suppressed vulnerabilities
        return { $or: suppressionPairs };
    } else if (supress === false || supress === 'false') {
        // Filter OUT suppressed vulnerabilities
        return { $nor: suppressionPairs };
    }

    // By default (supress is null or undefined), do not filter by suppression
    return {};
}