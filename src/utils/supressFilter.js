export function supressFilter(rules = [], suppress) {
    if (!rules.length) {
        return suppress ? { _id: { $in: [] } } : {};
    }

    const ruleIds = rules.map(r => r.ruleId);
    const requestIds = rules.map(r => r.requestId);

    if (suppress === true || suppress === 'true') {
        // ✅ Return only suppressed vulnerabilities
        return {
            $and: [
                { "ruleSnapshot._id": { $in: ruleIds } },
                { "requestSnapshot._id": { $in: requestIds } }
            ]
        };
    } else if (suppress === false || suppress === 'false') {
        // 🚫 Exclude suppressed vulnerabilities
        return {
            $nor: [
                { "ruleSnapshot._id": { $in: ruleIds } },
                { "requestSnapshot._id": { $in: requestIds } }
            ]
        };
    }

    // 🟢 Default — no suppression filter applied
    return {};
}