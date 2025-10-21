import { mqbroker } from "../services/rabbitmq.service.js";
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
import "../db/mongoose.js";

import { syncRulesFromGithub } from "./sync-rules.worker.js";


const parser = new PostmanParser();
const integrationService = new IntegrationService();


async function transformationHandler(payload, msg, channel) {
    const { _id, requestIds, ruleIds, environmentId, orgId, projectId, scope } = payload;
    try {
        console.log("[+] TRANSFORMATION TRIGGERED : ", _id);

        await Scan.updateOne({ _id: _id }, {
            $set: {
                status: "pending",
                startedAt: new Date()
            }
        });

        // Fetch all requests and rules
        const requests = await Requests.find({ _id: { $in: requestIds } }).lean();
        const rules = await Rules.find({ _id: { $in: ruleIds }, isActive: true }).lean();

        console.log("[+] TOTAL REQUSTS : ", requests.length);
        console.log("[+] TOTAL RULES : ", rules.length);

        // console.log("[+] RULE: ", JSON.stringify(rules));

        // Fetch environment variables if environmentId is provided
        let environmentVariables = {};
        if (environmentId) {
            const environment = await RawEnvironment.findById(environmentId).lean();
            if (environment) {
                // Convert environment values to key-value pairs
                environment.values
                    // .filter(v => v.enabled && v.key)
                    .filter(v => v.key)
                    .forEach(v => {
                        environmentVariables[v.key] = v.value;
                    });

                console.log(`[+] Loaded ${Object.keys(environmentVariables).length} environment variables`);
            }
        }

        const bulkOps = [];

        console.log("[+] ENVIRONMENT VARIABLES: ", environmentVariables);

        const scopeRegexes = (scope && scope.length > 0)
            ? scope.map(pattern => new RegExp(pattern))
            : null;

        // Generate transformed requests (cartesian product)
        for (let rule of rules) {
            for (let request of requests) {
                // Remove fields
                const { _id: reqId, __v: _, ...reqObject } = request;

                // Apply environment variable substitution if environment is provided
                let processedRequest = reqObject;

                if (environmentId && Object.keys(environmentVariables).length > 0) {
                    const urlResolvedRequest = substituteUrlVariables(reqObject, environmentVariables);

                    if (scopeRegexes) {
                        const url = urlResolvedRequest.url;
                        const isInScope = scopeRegexes.some(regex => regex.test(url));

                        if (!isInScope) {
                            continue; // Skip this request
                        }
                    }
                    processedRequest = substituteNonUrlVariables(urlResolvedRequest, environmentVariables);
                }

                const targetMatch = await EngineService.matchTarget({ rule, transformedRequest: { ...processedRequest, raw: processedRequest.rawHttp } });

                if (!targetMatch) {
                    continue;
                }

                // console.log("[+] PROCESSED REQUEST : ", processedRequest);

                // Apply rule transformations
                let transformed;

                try {
                    transformed = await EngineService.transform({ request: processedRequest, rule: rule.parsed_yaml });
                }
                catch (err) {
                    console.log(err);
                    continue;
                }

                for (let t of transformed) {
                    bulkOps.push({
                        insertOne: {
                            document: {
                                scanId: _id,
                                orgId,
                                requestId: request._id,
                                ruleId: rule._id,
                                projectId: projectId,
                                ...t,
                                // rawHttp: parser.buildRawRequest(t.method, t.url, t.headers, t.body, []),
                            }
                        }
                    });
                }
            }
        }

        console.log(`[+] CREATED ${bulkOps.length} TRANSFORMED REQUESTS`)

        // Write transformed requests to db
        if (bulkOps.length > 0) {
            await TransformedRequest.bulkWrite(bulkOps);
        }

        // Update scan stats
        await Scan.updateOne({ _id: _id }, {
            $set: {
                'stats.totalTransformedRequests': bulkOps.length
            }
        });

        // Publish to run queue
        await mqbroker.publish("apisec", "apisec.scan.run", payload);
    }
    catch (err) {
        console.log("[+] ERROR WHILE TRANSFORMING : ", err);
        await Scan.updateOne({ _id: _id }, {
            $set: {
                status: "failed",
                error: {
                    message: err.message,
                    stack: err.stack,
                    occurredAt: new Date()
                }
            }
        });
    }
    finally {
        channel.ack(msg);
    }
}


async function runScan(payload, msg, channel) {
    const { _id, orgId, name, projectIds } = payload;

    try {
        console.log("[+] SCAN EXECUTION TRIGGERED : ", _id);

        await Scan.updateOne({ _id: _id }, {
            $set: {
                status: "running"
            }
        });

        // Get transformed requests
        const transformed_requests = await TransformedRequest.find({ scanId: _id, state: "pending" }).lean();

        // Store total count for tracking completion
        const totalTransformedRequests = transformed_requests.length;

        // Process each transformed request
        for (let transformedRequest of transformed_requests) {
            await mqbroker.publish("apisec", "apisec.scan.execute.single", { scan: payload, request: transformedRequest })
        }

        // Check for scan completion periodically
        const checkInterval = setInterval(async () => {
            const completedCount = await TransformedRequest.countDocuments({
                scanId: _id,
                state: "complete"
            });

            const failedCount = await TransformedRequest.countDocuments({
                scanId: _id,
                state: "failed"
            });

            const processedCount = completedCount + failedCount;

            // Check if all requests are processed
            if (processedCount >= totalTransformedRequests) {
                clearInterval(checkInterval);

                // Update scan as completed
                const scan = await Scan.findByIdAndUpdate(_id, {
                    $set: {
                        status: "completed",
                        completedAt: new Date(),
                        'stats.processedRequests': processedCount,
                        'stats.failedRequests': failedCount
                    }
                }, { new: true });

                // Calculate execution time
                const executionTime = scan.completedAt - scan.startedAt;
                const executionMinutes = Math.round(executionTime / 60000);

                // Send Scan Finish notification
                try {
                    const scanFinishNotification = {
                        store: true,
                        orgId: orgId,
                        channels: ["email"],
                        notification: {
                            title: "Scan Completed",
                            description: `Scan "${scan.name}" has completed with ${scan.stats.vulnerabilitiesFound || 0} vulnerabilities found.`,
                            resourceUrl: `/scans/${scan._id}`,
                            origin: "aim",
                            resourceMeta: {
                                product: "aim",
                                action: "scan_finish",
                                resource: "scan"
                            }
                        },
                        context: {
                            name: "User",
                            title: "API Security Scan Completed",
                            description: `Your API security scan "${scan.name}" has completed successfully. 
                            
Summary:
• Total Requests Tested: ${scan.stats.totalRequests}
• Security Rules Applied: ${scan.stats.totalRules}
• Vulnerabilities Found: ${scan.stats.vulnerabilitiesFound || 0}
• Critical: ${scan.vulnerabilitySummary?.critical || 0}
• High: ${scan.vulnerabilitySummary?.high || 0}
• Medium: ${scan.vulnerabilitySummary?.medium || 0}
• Low: ${scan.vulnerabilitySummary?.low || 0}
• Execution Time: ${executionMinutes} minutes`,
                            status: failedCount > 0 ? "warning" : "success",
                            timestamp: Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
                            action_text: "View Results",
                            action_url: `https://suite.snapsec.co/scans/${scan._id}/results`,
                            base_url: "https://suite.snapsec.co",
                            subject: `Scan Completed - ${scan.stats.vulnerabilitiesFound || 0} Vulnerabilities Found - Snapsec`
                        },
                        orgCoverage: { roles: ["Member"] },
                        authContext: 'system'
                    };

                    await mqbroker.publish("notification", "notification", scanFinishNotification);
                } catch (notificationError) {
                    console.error('Failed to send scan completion notification:', notificationError);
                }
            }
        }, 5000); // Check every 5 seconds

        // Set a timeout to prevent infinite checking
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 3600000); // 1 hour timeout

    } catch (err) {
        console.error("[!] ERROR WHILE RUNNING SCAN:", err);

        await Scan.updateOne({ _id: _id }, {
            $set: {
                status: "failed",
                error: {
                    message: err.message,
                    stack: err.stack,
                    occurredAt: new Date()
                }
            }
        });

        // Send failure notification
        try {
            const scanFailureNotification = {
                store: true,
                orgId: orgId,
                channels: ["email"],
                notification: {
                    title: "Scan Failed",
                    description: `Scan "${name}" has failed due to an error.`,
                    resourceUrl: `/scans/${_id}`,
                    origin: "aim",
                    resourceMeta: {
                        product: "aim",
                        action: "scan_failed",
                        resource: "scan"
                    }
                },
                context: {
                    name: "User",
                    title: "Scan Failed",
                    description: `Your API security scan "${name}" has encountered an error and could not complete. Error: ${err.message}`,
                    status: "error",
                    timestamp: Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
                    action_text: "View Details",
                    action_url: `https://suite.snapsec.co/scans/${_id}`,
                    base_url: "https://suite.snapsec.co",
                    subject: "Scan Failed - Snapsec"
                },
                orgCoverage: { roles: ["Member"] },
                authContext: 'system'
            };

            await mqbroker.publish("notification", "notification", scanFailureNotification);
        } catch (notificationError) {
            console.error('Failed to send scan failure notification:', notificationError);
        }

        // Mark all pending transformed requests as failed
        await TransformedRequest.updateMany(
            { scanId: _id, state: { $in: ["pending", "running"] } },
            {
                $set: {
                    state: "failed",
                    error: {
                        message: "Scan failed",
                        occurredAt: new Date()
                    }
                }
            }
        );
    }
    finally {
        // Calculate and update execution time
        // const scan = await Scan.findById(_id);
        // if (scan && scan.startedAt) {
        //     const executionTime = new Date() - scan.startedAt;
        //     await Scan.updateOne({ _id: _id }, {
        //         $set: { executionTime }
        //     });
        // }

        channel.ack(msg);
    }
}


// this function is what handles scan on individual transformed requests
async function runAndMatchRequests(payload, msg, channel) {
    const { scan: scanObj, request } = payload;

    const { _id, orgId, name } = scanObj;
    const transformedRequest = request;

    try {

        const scan = await Scan.findOne({ _id: _id });

        if (["paused", "halted", "cancelled"].includes(scan.status)) {
            return;
        }

        // Update state
        await TransformedRequest.updateOne(
            { _id: transformedRequest._id },
            { $set: { state: "running" } }
        );

        // Get the associated rule for matching
        const rule = await Rules.findOne({ _id: transformedRequest.ruleId }).lean();
        const originalRequest = await Requests.findOne({ _id: transformedRequest.requestId }).lean();


        // Send the request
        console.log(`[+] Sending request to: ${transformedRequest.url}`);
        
        const response = await EngineService.sendRequest({ request: transformedRequest });

        if (response.error) {
            console.log("[+] request errored out ", response.message);
            return;
        }

        // Check for matches using detailed matching
        const matchResult = await EngineService.match({ response, rule: rule.parsed_yaml });

        if (transformedRequest.url?.match(/\/xss/g))
            console.log(`[+] Match result:`, matchResult);

            // console.log("[+] FOUND VULN : ", {
            //     ruleId: rule._id,
            //     requestId: originalRequest._id,
            //     projectId: originalRequest.projectId,
            //     transformedRequestId: transformedRequest._id,
            // })
        

        if (matchResult.matched) {
            // CREATE TEMPLATE CONTEXT FOR DYNAMIC PLACEHOLDERS
            const templateContext = TemplateEngine.createVulnerabilityContext({
                transformedRequest,
                originalRequest,
                response,
                rule,
                matchResult,
                scanName: name,
                scanId: _id
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
                scanName: name,
                scanId: _id,
                ruleId: rule._id,
                requestId: originalRequest._id,
                projectId: originalRequest.projectId,
                transformedRequestId: transformedRequest._id,

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
                    highlight: matchResult.highlight,
                    // matchedCriteria: matchResult.matchedCriteria
                }
            };

            // log ids for rule, raw request and transformed req
            console.log("thissssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss", rule._id, originalRequest._id, transformedRequest._id)
            console.log("[+] Vulnerability data to be saved:", vulnerabilityData);

            try {
                await Vulnerability.create([vulnerabilityData]);
                console.log(`[+] Created vulnerability record - ${vulnerabilityData.title}`);
            } catch (vulnError) {
                console.error("[!] Error creating vulnerabilities:", vulnError);
            }

            // Also prepare finding for scan document
            // scanFindings.push({
            //     ruleId: rule._id,
            //     ruleName: rule.rule_name,
            //     requestId: originalRequest._id,
            //     requestName: originalRequest.name,
            //     requestUrl: originalRequest.url,
            //     method: originalRequest.method,
            //     vulnerability: {
            //         type: rule.report.vulnerabilityType,
            //         severity: rule.report.severity,
            //         description: rule.report.description,
            //         evidence: {
            //             request: vulnerabilityData.evidence.request,
            //             response: vulnerabilityData.evidence.response,
            //             matchedCriteria: matchResult.matchedCriteria.description
            //         }
            //     },
            //     detectedAt: new Date()
            // });

            // Send report if configured
            // if (rule.report.sendReport) {
            //     try {
            //         await EngineService.sendReport({ 
            //             report: {
            //                 ...rule.report,
            //                 scanId: _id,
            //                 detectedAt: new Date(),
            //                 evidence: vulnerabilityData.evidence
            //             }
            //         });
            //     } catch (reportError) {
            //         console.error("[!] Failed to send report:", reportError);
            //     }
            // }

            await Scan.updateOne({ _id: _id }, {
                $inc: { 'stats.vulnerabilitiesFound': 1, [`vulnerabilitySummary.${vulnerabilityData.severity}`]: 1 },
            });
        }


        // Update transformed request state
        await TransformedRequest.updateOne(
            { _id: transformedRequest._id },
            {
                $set: {
                    state: "complete",
                    executionResult: {
                        matched: matchResult.matched,
                        executedAt: new Date(),
                        responseStatus: response.status,
                        responseTime: response.time
                    }
                }
            }
        );

    } catch (requestError) {
        console.error(`[!] Error processing request ${transformedRequest._id}:`, requestError);

        await TransformedRequest.updateOne(
            { _id: transformedRequest._id },
            {
                $set: {
                    state: "failed",
                    error: {
                        message: requestError.message,
                        occurredAt: new Date()
                    }
                }
            }
        );

        // failedCount++;
    }
    finally {
        channel.ack(msg);
    }
}


// sync requests from integration.
async function syncIntegration(payload, msg, channel) {
    const { integration, apiKey, environment } = payload;
    console.log("[+] SYNCING INTEGRATION : ", integration);

    try {
        await integrationService.syncIntegration(integration, apiKey, environment);
    }
    catch (err) {
        console.log(err);
    }
    finally {
        channel.ack(msg);
    }
}


async function scanWorker() {

    console.log('[+] SCAN WORKER IS UP...')

    await mqbroker.consume("apisec", "apisec.scan.create", transformationHandler, 'scanCreatedEventsQueue');
    await mqbroker.consume("apisec", "apisec.scan.run", runScan, 'scanRunEventsQueue');

    // depending on no of events in the queue, scale up or down
    await mqbroker.consume("apisec", "apisec.scan.execute.single", runAndMatchRequests, 'transformedRequestEventQueue');


    await mqbroker.consume("apisec", "apisec.integration.sync", syncIntegration, 'SyncIntegrationEventsQueue');
}


scanWorker();
syncRulesFromGithub();