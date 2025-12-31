import { EngineService } from "../../services/engine/engine.service.js";
import Rule from "../../models/rule.model.js";
import RawRequest from "../../models/rawRequest.model.js";
import TransformedRequest from "../../models/transformedRequest.model.js";
import TemplateEngine from "../../utils/template.js";


export async function requestReplay({ requestIds = [], scan, project }) {

    if (requestIds?.length == 0) {
        console.log("[-] NO REQUESTS GIVEN TO REPLAY");
    }

    const vulns = [];

    for (let reqId of requestIds) {

        const transformed_request = await TransformedRequest.findOne({ _id: reqId });
        const raw_request = await RawRequest.findOne({ _id: transformed_request.requestId });

        const rule = await Rule.findOne({ _id: transformed_request.ruleId });

        const response = await EngineService.replay({
            request: transformed_request,
            rule: rule.parsed_yaml
        });

        if (response.error) {
            console.log("[-] ERROR REPLAYING REQUEST: ", response.error);
        }

        const match = await EngineService.match({
            rule: rule.parsed_yaml,
            response
        });

        if (match?.match) {

            const templateContext = TemplateEngine.createVulnerabilityContext({
                transformedRequest: transformed_request,
                originalRequest: raw_request,
                response,
                rule,
                matchResult: match,
                scanId: scan._id 
            });

            const reportFields = rule.parsed_yaml.report;

            const processedReport = TemplateEngine.processFields({
                title: reportFields.title,
                description: reportFields.description,
                impact: reportFields.impact,
                stepsToReproduce: reportFields.stepsToReproduce,
                mitigation: reportFields.mitigation
            }, templateContext);

            const vulnerabilityData = {
                orgId: scan.orgId,
                scanName: scan.name,
                scanId: scan._id,
                ruleSnapshot: rule,
                requestSnapshot: raw_request,
                transformedRequestSnapshot: transformed_request,
                projectId: raw_request.projectIds,

                title: processedReport.title || `${reportFields.vulnerabilityType} in ${raw_request.name}`,
                type: reportFields.vulnerabilityType,
                severity: reportFields.severity,
                cvssScore: reportFields.cvssScore,
                description: processedReport.description,
                impact: processedReport.impact,
                stepsToReproduce: processedReport.stepsToReproduce,
                mitigation: processedReport.mitigation,
                tags: Array.isArray(reportFields.tags)
                    ? reportFields.tags
                    : reportFields.tags?.split?.(",") || [],

                cwe: reportFields.cwe,
                owasp: reportFields.owasp,

                requestDetails: {
                    name: raw_request.name,
                    method: raw_request.method,
                    url: raw_request.url,
                    collectionName: raw_request.collectionName,
                    folderName: raw_request.folderName
                },
                ruleDetails: {
                    name: rule.rule_name,
                    category: rule.category
                },

                evidence: {
                    request: {
                        method: transformed_request.method,
                        url: transformed_request.url,
                        headers: transformed_request.headers,
                        body: transformed_request.body,
                        transformations: transformed_request.appliedTransformations || []
                    },
                    response: {
                        status: response.status,
                        statusText: response.statusText || '',
                        headers: response.headers || {},
                        body: response.body,
                        size: response.size || 0,
                        responseTime: response.time || 0
                    },
                    highlight: match?.highlight || "",
                }
            };

            vulns.push(vulnerabilityData);
        }
    }

    return vulns;
    
}