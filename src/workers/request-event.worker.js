import { mqbroker } from "../services/rabbitmq.service.js";
import { ScanService } from "../services/scan.service.js";
import Scan from "../models/scan.model.js";
import Requests from "../models/rawRequest.model.js";
import Rules from "../models/rule.model.js";
import RawEnvironment from "../models/rawEnvironment.model.js";
import TransformedRequest from "../models/transformedRequest.model.js";
import { EngineService } from "../services/engine/engine.service.js";
import Vulnerability from "../models/vulnerability.model.js";
import { substituteVariables, substituteUrlVariables, substituteNonUrlVariables } from "../utils/variableSubstitution.js";
import { PostmanParser } from "../utils/postman/postmanParser.js";
import { IntegrationService } from "../services/integration.service.js";
import TemplateEngine from "../utils/template.js";
import { AuthProfile } from "../models/auth-profile.model.js";
import { Projects } from '../models/projects.model.js';
import "../db/mongoose.js";

const scanService = new ScanService();

async function requestCreatedHandler(payload, msg, channel) {
  const { projectId, orgId, request, project } = payload;

  try {
    console.log(`[+] REQUEST SCAN INITIATED`);

    if (!projectId || !orgId) {
      console.error('[!] Invalid payload received. Missing projectId or orgId.', payload);
      return channel.ack(msg);
    }

    const scanData = {
      name: project.name,
      description: project.description,
      orgId: orgId,
      requestIds: [request._id],
      projectIds: [projectId],
      status: "running"
    };

    const scan = await scanService.createProjectScanInstance(scanData);

    console.log("[+] GIVEN SCAN: ", scan.name, scan._id);

    const rules = await Rules.find({ _id: { $in: project.includedRuleIds } }).lean();

    const { _id: requestId } = request;

    let cleanRequest = { ...request };

    delete cleanRequest._id;
    delete cleanRequest.__v;
    delete cleanRequest.createdAt;
    delete cleanRequest.updatedAt;


    for (let rule of rules) {
      const bulkOps = [];

      let transformed;

      try {
        transformed = await EngineService.transform({ request: cleanRequest, rule: rule.parsed_yaml });

        for (let k of transformed) console.log("[+] AFTER TRANSFORMATIONS RAN: ", k.headers);

      } catch (err) {
        console.log(err);
        continue;
      }

      for (let t of transformed) {
        bulkOps.push({
          insertOne: {
            document: {
              scanId: scan._id,
              orgId,
              requestId,
              ruleId: rule._id,
              ...t,
            },
          },
        });
      }

      const created_requests = await TransformedRequest.bulkWrite(bulkOps);
      const transformed_request_ids = Object.values(created_requests.insertedIds);

      await mqbroker.publish("apisec", "apisec.request.scan", {
        transformed_request_ids,
        orgId,
        projectId,
        request,
        project,
        scanId: scan._id,
        scan,
      });

      console.log(`[+] CREATED ${created_requests.insertedCount} TRANSFORMED REQUESTS`);
    }
  } catch (error) {
    console.log(`[!] Error processing request.created event for project ${projectId}:`, error.message);
  } finally {
    channel.ack(msg);
  }
}



async function runScan(payload, msg, channel) {
    const { orgId, projectId, request, project, transformed_request_ids, scanId, scan } = payload;

    try {
        if (transformed_request_ids.length === 0) {
            return channel.ack(msg);
        }

        const requests = await TransformedRequest.find({ _id: { $in: transformed_request_ids } }).lean();

        for (let request of requests) {

            const transformedRequest = request;
            const originalRequest = await Requests.findOne({ _id: request.requestId }).lean();
            const rule = await Rules.findOne({ _id: request.ruleId }).lean();

            const response = await EngineService.sendRequest({ request, rule: rule.parsed_yaml });

            const match = await EngineService.match({ response: response, rule: rule.parsed_yaml });

            if (match?.match) {
                console.log("[+] MATCH FOUND : [GIVEN PROJECT ID] : ", originalRequest.projectIds, transformedRequest.projectId);

                const templateContext = TemplateEngine.createVulnerabilityContext({
                    transformedRequest: request,
                    originalRequest: request,
                    response,
                    rule,
                    matchResult: match,
                    scanId: scanId
                });

                // PROCESS TEMPLATE FIELDS FROM THE RULE
                const reportFields = rule.parsed_yaml.report;
                const processedReport = TemplateEngine.processFields({
                    title: reportFields.title,
                    description: reportFields.description,
                    impact: reportFields.impact,
                    stepsToReproduce: reportFields.stepsToReproduce,
                    mitigation: reportFields.mitigation
                }, templateContext);

                // Create vulnerability data with processed templates
                const vulnerabilityData = {
                    orgId,
                    scanName: scan.name,
                    scanId: scanId,
                // Deprecated
                // ruleId: rule._id,
                // requestId: originalRequest._id,
                // transformedRequestId: transformedRequest._id,

                ruleSnapshot: rule,
                requestSnapshot: originalRequest,
                transformedRequestSnapshot: transformedRequest,
                projectId: originalRequest.projectIds, // althugh I am sending this in 'requestSnapshot' but I am keeping this to keep the original structure intact
                    // ruleId: templateContext.ruleId,
                    // requestId: templateContext.requestId,
                    // transformedRequestId: templateContext.transformedRequestId,

                    // Use processed template values
                    title: processedReport.title || `${reportFields.vulnerabilityType} in ${originalRequest.name}`,
                    type: rule.parsed_yaml.report.vulnerabilityType,
                    severity: rule.parsed_yaml.report.severity,
                    cvssScore: rule.parsed_yaml.report.cvssScore,
                    description: processedReport.description,
                    impact: processedReport.impact,
                    stepsToReproduce: processedReport.stepsToReproduce,
                    mitigation: processedReport.mitigation,
                    tags: Array.isArray(rule.parsed_yaml.report.tags) ? rule.parsed_yaml.report.tags : rule.parsed_yaml.report?.tags?.split?.(",") || [],

                    // Technical details
                    cwe: rule.parsed_yaml.report.cwe,
                    owasp: rule.parsed_yaml.report.owasp,

                    // Request/Rule context
                    requestDetails: {
                        name: originalRequest.name,
                        method: originalRequest.method,
                        url: originalRequest.url,
                        collectionName: originalRequest.collectionName,
                        folderName: originalRequest.folderName
                    },
                    ruleDetails: {
                        name: rule.rule_name,
                        category: rule.category
                    },

                    // Evidence
                    evidence: {
                        request: {
                            method: transformedRequest.method,
                            url: transformedRequest.url,
                            headers: transformedRequest.headers,
                            body: transformedRequest.body,
                            transformations: transformedRequest.appliedTransformations || []
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
                        // matchedCriteria: matchResult.matchedCriteria
                    }
                };

                try {
                    await Vulnerability.create([vulnerabilityData], { strict: false });
                    console.log(`[+] Created vulnerability record - ${vulnerabilityData.title}`);
                } catch (vulnError) {
                    console.error("[!] Error creating vulnerabilities:", vulnError.message);
                }
            }

        }


    } catch (error) {
        console.error(`[!] Error processing request.scan event for project ${projectId}:`, error);
    } finally {
        channel.ack(msg);
    }
}



/**
 * Initializes the worker to consume request-related events.
 */
async function requestEventWorker() {
    console.log('[+] REQUEST EVENT WORKER IS UP...');

    // Consume events where a new request is created in a project
    await mqbroker.consume("apisec", "apisec.request.created", requestCreatedHandler, 'requestCreatedEventsQueue2');
    await mqbroker.consume("apisec", "apisec.request.scan", runScan, 'requestScanEventsQueue');
}

// Start the worker
requestEventWorker();
