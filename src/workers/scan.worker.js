import { mqbroker } from "../services/rabbitmq.service.js";
import Scan from "../models/scan.model.js";
import Requests from "../models/rawRequest.model.js";
import Rules from "../models/rule.model.js";
import RawEnvironment from "../models/rawEnvironment.model.js";
import TransformedRequest from "../models/transformedRequest.model.js";
import { EngineService } from "../services/engine/engine.service.js";
import Vulnerability from "../models/vulnerability.model.js";
import { substituteVariables } from "../utils/variableSubstitution.js";
import { PostmanParser } from "../utils/postman/postmanParser.js";


const parser = new PostmanParser();


async function transformationHandler(payload, msg, channel) {
    const { _id, requestIds, ruleIds, environmentId, orgId } = payload;
    try {
        console.log("[+] TRANSFORMATION TRIGGERED : ", _id);

        await Scan.updateOne({ _id: _id }, { 
            $set: { 
                status: "pending",
                startedAt: new Date()
            }
        });

        // Fetch all requests and rules
        const requests = await Requests.find({ _id: { $in: requestIds }}).lean();
        const rules = await Rules.find({ _id: { $in: ruleIds }}).lean();

        console.log("[+] TOTAL REQUSTS : ", requests.length);
        console.log("[+] TOTAL RULES : ", rules.length);

        console.log("[+] RULE: ", JSON.stringify(rules));

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

        // Generate transformed requests (cartesian product)
        for (let rule of rules) {
            for (let request of requests) {
                // Remove fields
                const { _id: reqId, __v: _, ...reqObject } = request;

                // Apply environment variable substitution if environment is provided
                let processedRequest = reqObject;
                if (environmentId && Object.keys(environmentVariables).length > 0) {
                    processedRequest = substituteVariables(reqObject, environmentVariables);
                }
                console.log("[+] PROCESSED REQUEST : ", processedRequest);


                // Apply rule transformations
                // const transformed = await EngineService.transform({ request: processedRequest, rule: rule.parsed_yaml }); // check later

                // for (let t of transformed) {
                //     bulkOps.push({
                //         insertOne: { 
                //             document: { 
                //                 scanId: _id, 
                //                 orgId,
                //                 requestId: request._id, 
                //                 ruleId: rule._id, 
                //                 ...t,
                //                 rawHttp: parser.buildRawRequest(t.method, t.url, t.headers, t.body, t.params)
                //             } 
                //         }
                //     });
                // }
            }
        }

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
    catch(err) {
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
    const { _id, orgId, name } = payload;
    try {
        console.log("[+] SCAN EXECUTION TRIGGERED : ", _id);

        await Scan.updateOne({ _id: _id }, { 
            $set: { 
                status: "running"
            }
        });

        // Get transformed requests
        const transformed_requests = await TransformedRequest.find({ scanId: _id, state: "pending" }).lean();

        let processedCount = 0;
        let failedCount = 0;
        const vulnerabilities = [];
        const scanFindings = [];

        // Process each transformed request
        for (let transformedRequest of transformed_requests) {
            try {

                const scan = await Scan.findOne({ _id: _id });

                if (scan.status == "paused") {
                    channel.ack(msg);
                    return;
                }
                else if (scan.status == "cancelled" || scan.status == "halted") {
                    await TransformedRequest.updateMany({ scanId: _id, state: "pending" }, { $set: { state: scan.status } });
                    channel.ack(msg);
                    return;
                }


                // console.log(`[+] Processing request: ${transformedRequest._id}`);

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

                // Check for matches using detailed matching
                const matchResult = await EngineService.match({ response, rule });

                // console.log(`[+] Match result:`, matchResult);

                if (matchResult.matched) {
                    // Create vulnerability data
                    const vulnerabilityData = {
                        orgId,
                        scanName: name,
                        scanId: _id,
                        ruleId: rule._id,
                        requestId: originalRequest._id,
                        transformedRequestId: transformedRequest._id,
                        
                        // Basic info from rule report
                        title: rule.report.title || `${rule.report.vulnerabilityType} in ${originalRequest.name}`,
                        type: rule.report.vulnerabilityType,
                        severity: rule.report.severity,
                        cvssScore: rule.report.cvssScore,
                        description: rule.report.description,
                        impact: rule.report.impact,
                        stepsToReproduce: rule.report.stepsToReproduce,
                        mitigation: rule.report.mitigation,
                        tags: rule.report.tags?.split?.(",") || [],
                        
                        // Technical details
                        cwe: rule.report.cwe,
                        owasp: rule.report.owasp,
                        
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
                            // matchedCriteria: matchResult.matchedCriteria
                        }
                    };

                    vulnerabilities.push(vulnerabilityData);

                    // Also prepare finding for scan document
                    scanFindings.push({
                        ruleId: rule._id,
                        ruleName: rule.rule_name,
                        requestId: originalRequest._id,
                        requestName: originalRequest.name,
                        requestUrl: originalRequest.url,
                        method: originalRequest.method,
                        vulnerability: {
                            type: rule.report.vulnerabilityType,
                            severity: rule.report.severity,
                            description: rule.report.description,
                            evidence: {
                                request: vulnerabilityData.evidence.request,
                                response: vulnerabilityData.evidence.response,
                                matchedCriteria: matchResult.matchedCriteria.description
                            }
                        },
                        detectedAt: new Date()
                    });

                    // Send report if configured
                    if (rule.report.sendReport) {
                        try {
                            await EngineService.sendReport({ 
                                report: {
                                    ...rule.report,
                                    scanId: _id,
                                    detectedAt: new Date(),
                                    evidence: vulnerabilityData.evidence
                                }
                            });
                        } catch (reportError) {
                            console.error("[!] Failed to send report:", reportError);
                        }
                    }
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

                processedCount++;

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
                
                failedCount++;
            }

            // Update scan progress periodically
            if (processedCount % 10 === 0) {
                await Scan.updateOne({ _id: _id }, {
                    $set: {
                        'stats.processedRequests': processedCount,
                        'stats.failedRequests': failedCount
                    }
                });
            }
        }

        // Bulk create vulnerabilities
        if (vulnerabilities.length > 0) {
            try {
                await Vulnerability.create(vulnerabilities, { ordered: false, strict: false });
                console.log(`[+] Created ${vulnerabilities.length} vulnerability records`);
            } catch (vulnError) {
                console.error("[!] Error creating vulnerabilities:", vulnError);
                // Continue even if some vulnerabilities fail to save
            }
        }

        // Calculate vulnerability summary
        const vulnerabilitySummary = vulnerabilities.reduce((summary, vuln) => {
            summary[vuln.severity] = (summary[vuln.severity] || 0) + 1;
            return summary;
        }, { critical: 0, high: 0, medium: 0, low: 0 });

        // Final scan update
        await Scan.updateOne({ _id: _id }, {
            $set: {
                status: "completed",
                completedAt: new Date(),
                'stats.processedRequests': processedCount,
                'stats.failedRequests': failedCount,
                'stats.vulnerabilitiesFound': vulnerabilities.length,
                vulnerabilitySummary,
                findings: scanFindings
            }
        });

        console.log(`[+] Scan ${_id} completed. Processed: ${processedCount}, Failed: ${failedCount}, Vulnerabilities: ${vulnerabilities.length}`);

    } catch(err) {
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
        const scan = await Scan.findById(_id);
        if (scan && scan.startedAt) {
            const executionTime = new Date() - scan.startedAt;
            await Scan.updateOne({ _id: _id }, {
                $set: { executionTime }
            });
        }
        
        channel.ack(msg);
    }
}


// this function is what handles scan on individual transformed requests
async function runAndMatchRequests(payload, msg, channel) {
    try {}
    catch(err) {}
    finally {}
}


export async function scanWorker() {
    await mqbroker.consume("apisec", "apisec.scan.create", transformationHandler, 'scanCreatedEventsQueue');
    await mqbroker.consume("apisec", "apisec.scan.run", runScan, 'scanRunEventsQueue');
}