
export function supressFilter(rules = [], supress) {
    const requestIds = [];
    const ruleIds = [];

    for (let rule of rules) {
        requestIds.push(rule.requestId);
        ruleIds.push(rule.ruleId);
    }

    if (supress) {

        return {
            $and: [
                { requestId: { $in: requestIds } },
                { ruleIds: { $in: ruleIds } }
            ]
        }
    }
    else {

        return {
            $not: [
                {
                    $or: [
                        { requestId: { $in: requestIds } },
                        { ruleIds: { $in: ruleIds } }
                    ]
                }
            ]
        }
    }

}