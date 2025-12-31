import Rules from "../../models/rule.model.js";
import TransformedRequest from "../../models/transformedRequest.model.js";
import EngineService from "../../services/engine/engine.service.js";


export async function transformation({ request, project, scan }) {

    console.log("[+] SCANNING THE REQUEST : ", request?.url);

    const rules = await Rules.find({
        _id: { $in: project.includedRuleIds },
        orgId: project.orgId
    }).lean();

    // create transformed requests
    const bulkOps = [];
    let transformed_requests = [];
    let transformed = [];

    for(let rule of rules) {
        
        try {
            transformed = await EngineService.transform({
                request,
                rule: rule.parsed_yaml
            });

            if(transformed.length > 0) {
                transformed_requests.push(...transformed);
            }

            for (let t of transformed) {
                bulkOps.push({
                    insertOne: {
                        document: {
                            scanId: scan._id,
                            orgId: project.orgId,
                            requestId: request._id,
                            ruleId: rule._id,
                            projectId: project._id,
                            ...t,
                        },
                    },
                });
            }
        }
        catch(err) {
            console.log(err);
        }
    }

    console.log("[+] TOTAL TRANSFORMED REQUESTS : ", transformed_requests);

    // store transformed requests
    const created_requests = await TransformedRequest.bulkWrite(bulkOps, { ordered: false });
    const transformed_request_ids = Object.values(created_requests.insertedIds);

    return transformed_request_ids;
}