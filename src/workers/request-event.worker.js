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
import mongoose from 'mongoose';

const scanService = new ScanService();

async function requestCreatedHandler(payload, msg, channel) {
    const { projectId, orgId, request, project, timestamp } = payload;

    try {
        console.log(`[+] REQUEST SCAN INITIATED for request ${request._id}`);

        if (!projectId || !orgId || !request._id) {
            console.error('[!] Invalid payload received. Missing required fields.', payload);
            return channel.ack(msg);
        }

        // Create a unique processing key for this request-project combination
        const processingKey = `${projectId}:${request._id}`;

        // Check if we've already processed this exact request for this project
        const alreadyProcessed = await TransformedRequest.findOne({
            requestId: request._id,
            projectId: [new mongoose.Types.ObjectId(projectId)],
            orgId: orgId
        });

        if (alreadyProcessed) {
            console.log(`[!] Request ${request._id} already processed for project ${projectId}, skipping`);
            return channel.ack(msg);
        }

        // Verify request still exists and belongs to project
        const requestExists = await Requests.findOne({
            _id: request._id,
            orgId: orgId,
            projectIds: new mongoose.Types.ObjectId(projectId)
        });

        if (!requestExists) {
            console.log(`[!] Request ${request._id} not found or doesn't belong to project ${projectId}, skipping scan`);
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
        console.log("[+] SCAN INSTANCE: ", scan.name, scan._id);

        if (["paused", "halted", "cancelled"].includes(scan.status)) {
            console.log(`[!] Scan ${scan._id} is in ${scan.status} state, skipping`);
            return channel.ack(msg);
        }

        // Get rules for the project
        const rules = await Rules.find({
            _id: { $in: project.includedRuleIds },
            orgId: orgId
        }).lean();

        console.log(`[+] Found ${rules.length} rules for project ${projectId}`);

        const { _id: requestId } = request;
        let cleanRequest = { ...request };
        delete cleanRequest._id;
        delete cleanRequest.__v;
        delete cleanRequest.createdAt;
        delete cleanRequest.updatedAt;

        let totalTransformationsCreated = 0;

        for (let rule of rules) {
            // Check if transformations already exist for this rule-request combination
            const existingTransformation = await TransformedRequest.findOne({
                scanId: scan._id,
                requestId: requestId,
                ruleId: rule._id,
                projectId: [new mongoose.Types.ObjectId(projectId)]
            });

            if (existingTransformation) {
                console.log(`[!] Transformation already exists for request ${requestId} with rule ${rule._id}, skipping`);
                continue;
            }

            const bulkOps = [];
            let transformed;

            try {
                transformed = await EngineService.transform({
                    request: cleanRequest,
                    rule: rule.parsed_yaml
                });
                console.log(`[+] Rule ${rule.rule_name} generated ${transformed.length} transformations`);
            } catch (err) {
                console.log(`[!] Error transforming with rule ${rule._id}:`, err.message);
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
                            projectId: [new mongoose.Types.ObjectId(projectId)],
                            ...t,
                        },
                    },
                });
            }

            if (bulkOps.length > 0) {
                try {
                    const created_requests = await TransformedRequest.bulkWrite(bulkOps, { ordered: false });
                    const transformed_request_ids = Object.values(created_requests.insertedIds);
                    totalTransformationsCreated += created_requests.insertedCount;

                    await mqbroker.publish("apisec", "apisec.request.scan", {
                        transformed_request_ids,
                        orgId,
                        projectId,
                        request,
                        project,
                        scanId: scan._id,
                        scan,
                    });

                    console.log(`[+] Created ${created_requests.insertedCount} transformed requests for rule ${rule.rule_name}`);
                } catch (bulkErr) {
                    if (bulkErr.code === 11000) {
                        console.log(`[!] Duplicate key error for transformations, some may already exist`);
                    } else {
                        throw bulkErr;
                    }
                }
            }
        }

        console.log(`[+] TOTAL TRANSFORMATIONS CREATED: ${totalTransformationsCreated} for request ${requestId}`);

    } catch (error) {
        console.log(`[!] Error processing request.created event:`, error.message);
    } finally {
        channel.ack(msg);
    }
}

async function runScan(payload, msg, channel) {
    const { orgId, projectId, request, project, transformed_request_ids, scanId, scan } = payload;

    try {
        if (transformed_request_ids.length === 0) {
            return;
        }

        const requests = await TransformedRequest.find({ _id: { $in: transformed_request_ids } }).lean();
        let anyVulnerabilityCreatedOrUpdated = false;

        for (let transformedRequest of requests) {
            try {
                // Update state to running
                await TransformedRequest.updateOne(
                    { _id: transformedRequest._id },
                    { $set: { state: "running" } }
                );

                const originalRequest = await Requests.findOne({ _id: transformedRequest.requestId }).lean();
                const rule = await Rules.findOne({ _id: transformedRequest.ruleId }).lean();

                // Send the request
                const response = await EngineService.sendRequest({ request: transformedRequest, rule: rule.parsed_yaml });

                // Check for request error
                if (response.error) {
                    console.log("[!] Request errored out: ", response.message || response.error);

                    // Mark as failed
                    await TransformedRequest.updateOne(
                        { _id: transformedRequest._id },
                        {
                            $set: {
                                state: "failed",
                                execution: {
                                    status: "failed",
                                    completedAt: new Date(),
                                    response: {
                                        error: response.message || response.error || "Request failed"
                                    }
                                },
                                error: {
                                    message: response.message || response.error || "Request failed",
                                    occurredAt: new Date()
                                }
                            }
                        }
                    );

                    // Update scan stats for failed request
                    await Scan.updateOne({ _id: scanId }, {
                        $inc: { 'stats.processedRequests': 1, 'stats.failedRequests': 1 },
                    });

                    continue; // Skip to next request
                }

                // Match the response
                const match = await EngineService.match({ response: response, rule: rule.parsed_yaml });

                if (match?.match) {
                    console.log("[+] MATCH FOUND : [GIVEN PROJECT ID] : ", originalRequest.projectIds, transformedRequest.projectId);

                    const templateContext = TemplateEngine.createVulnerabilityContext({
                        transformedRequest: transformedRequest,
                        originalRequest: originalRequest,
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
                        scanId,
                        ruleSnapshot: rule,
                        requestSnapshot: originalRequest,
                        transformedRequestSnapshot: transformedRequest,
                        projectId: originalRequest.projectIds,

                        title: processedReport.title || `${reportFields.vulnerabilityType} in ${originalRequest.name}`,
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
                        }
                    };

                    try {
                        // DEDUPE LOGIC - Include transformed request ID for more specific deduplication
                        const query = {
                            orgId: vulnerabilityData.orgId,
                            scanId: vulnerabilityData.scanId,
                            'ruleSnapshot._id': rule._id,
                            'requestSnapshot._id': originalRequest._id,
                            'transformedRequestSnapshot._id': transformedRequest._id
                        };

                        // upsert: true -> create if not exists, update otherwise
                        const result = await Vulnerability.findOneAndUpdate(
                            query,
                            { $set: vulnerabilityData },
                            { upsert: true, new: true, setDefaultsOnInsert: true, rawResult: true }
                        );

                        if (!result.lastErrorObject.updatedExisting) {
                            console.log(`[+] Created new vulnerability record - ${vulnerabilityData.title}`);
                        } else {
                            console.log(`[+] Updated existing vulnerability record - ${vulnerabilityData.title}`);
                        }

                        anyVulnerabilityCreatedOrUpdated = true;

                        // Update transformed request state to complete with vulnerability detected
                        await TransformedRequest.updateOne(
                            { _id: transformedRequest._id },
                            {
                                $set: {
                                    state: "complete",
                                    vulnerabilityDetected: true,
                                    execution: {
                                        status: "success",
                                        startedAt: new Date(),
                                        completedAt: new Date(),
                                        responseTime: response.time || 0,
                                        response: {
                                            status: response.status,
                                            statusText: response.statusText || '',
                                            headers: response.headers || {},
                                            body: response.body,
                                            size: response.size || 0,
                                            error: null,
                                            version: response.version || ''
                                        }
                                    },
                                    executionResult: {
                                        matched: true,
                                        executedAt: new Date(),
                                        responseStatus: response.status,
                                        responseTime: response.time,
                                        response
                                    },
                                    matchResults: {
                                        matched: true,
                                        matchedCriteria: match.matchedCriteria,
                                        details: match.details || {}
                                    }
                                }
                            }
                        );

                        // Update scan stats for successful completion
                        await Scan.updateOne({ _id: scanId }, {
                            $inc: { 'stats.processedRequests': 1, 'stats.completedRequests': 1 },
                        });

                    } catch (vulnError) {
                        console.error("[!] Error creating/updating vulnerability:", vulnError.message);

                        // Even if vulnerability creation fails, mark request as complete
                        await TransformedRequest.updateOne(
                            { _id: transformedRequest._id },
                            {
                                $set: {
                                    state: "complete",
                                    execution: {
                                        status: "success",
                                        completedAt: new Date(),
                                        response: {
                                            status: response.status,
                                            error: "Vulnerability creation failed"
                                        }
                                    }
                                }
                            }
                        );

                        await Scan.updateOne({ _id: scanId }, {
                            $inc: { 'stats.processedRequests': 1, 'stats.completedRequests': 1 },
                        });
                    }
                } else {
                    // No match found - mark as complete without vulnerability
                    await TransformedRequest.updateOne(
                        { _id: transformedRequest._id },
                        {
                            $set: {
                                state: "complete",
                                vulnerabilityDetected: false,
                                execution: {
                                    status: "success",
                                    startedAt: new Date(),
                                    completedAt: new Date(),
                                    responseTime: response.time || 0,
                                    response: {
                                        status: response.status,
                                        statusText: response.statusText || '',
                                        headers: response.headers || {},
                                        body: response.body,
                                        size: response.size || 0,
                                        error: null,
                                        version: response.version || ''
                                    }
                                },
                                executionResult: {
                                    matched: false,
                                    executedAt: new Date(),
                                    responseStatus: response.status,
                                    responseTime: response.time,
                                    response
                                },
                                matchResults: {
                                    matched: false,
                                    details: {}
                                }
                            }
                        }
                    );

                    // Update scan stats for completed request without vulnerability
                    await Scan.updateOne({ _id: scanId }, {
                        $inc: { 'stats.processedRequests': 1, 'stats.completedRequests': 1 },
                    });
                }

            } catch (err) {
                console.error(`[!] Error processing transformed request ${transformedRequest._id}:`, err);

                // Mark transformed request as failed
                await TransformedRequest.updateOne(
                    { _id: transformedRequest._id },
                    {
                        $set: {
                            state: "failed",
                            execution: {
                                status: "failed",
                                completedAt: new Date(),
                                response: {
                                    error: err.message || "Unknown error"
                                }
                            },
                            error: {
                                message: err.message,
                                stack: err.stack,
                                occurredAt: new Date()
                            }
                        }
                    }
                );

                // Update scan stats for failed request
                await Scan.updateOne({ _id: scanId }, {
                    $inc: { 'stats.processedRequests': 1, 'stats.failedRequests': 1 },
                });
            }
        }

        // After processing all requests, recalculate vulnerability stats if any vulnerabilities were created/updated
        if (anyVulnerabilityCreatedOrUpdated) {
            await recalculateScanVulnerabilityStats(scanId);
        }

    } catch (error) {
        console.error(`[!] Error processing request.scan event for project ${projectId}:`, error);
    } finally {
        channel.ack(msg);
    }
}
// Helper function to recalculate vulnerability stats from actual data
async function recalculateScanVulnerabilityStats(scanId) {
    try {
        // Get actual vulnerability counts from the database
        const vulnStats = await Vulnerability.aggregate([
            {
                $match: {
                    scanId: mongoose.Types.ObjectId.isValid(scanId)
                        ? mongoose.Types.ObjectId.createFromHexString(scanId.toString())
                        : scanId
                }
            },
            {
                $group: {
                    _id: "$severity",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Initialize summary object
        const summary = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
        };

        let totalVulns = 0;

        // Fill in the actual counts
        vulnStats.forEach(stat => {
            if (summary.hasOwnProperty(stat._id)) {
                summary[stat._id] = stat.count;
                totalVulns += stat.count;
            }
        });

        // Update the scan with correct vulnerability stats
        await Scan.updateOne(
            { _id: scanId },
            {
                $set: {
                    'vulnerabilitySummary': summary,
                    'stats.vulnerabilitiesFound': totalVulns
                }
            }
        );

        console.log(`[+] Updated scan ${scanId} vulnerability stats: Total=${totalVulns}, Critical=${summary.critical}, High=${summary.high}, Medium=${summary.medium}, Low=${summary.low}`);

        return { summary, totalVulns };
    } catch (error) {
        console.error(`[!] Error recalculating vulnerability stats for scan ${scanId}:`, error);
        return null;
    }
}

/**
 * Initializes the worker to consume request-related events.
 */
async function requestEventWorker() {
    console.log('[+] REQUEST EVENT WORKER IS UP...');

    // Consume events where a new request is created in a project
    await mqbroker.consume("apisec", "apisec.request.created", requestCreatedHandler, 'requestCreatedEventsQueue2');
    await mqbroker.consume("apisec", "apisec.request.scan", runScan, 'requestScanEventsQueue2');
}

// Start the worker
requestEventWorker();