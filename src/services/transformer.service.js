import TransformedRequest from '../models/transformedRequest.model.js';
import requestExecutor from '../utils/requestExecutor.js';
import { ApiError } from '../utils/ApiError.js';

export class TransformerService {
    constructor() {
        // Bind methods
        this.processTransformations = this.processTransformations.bind(this);
        this.applyTransformations = this.applyTransformations.bind(this);
        this.executeRequest = this.executeRequest.bind(this);
        this.checkVulnerability = this.checkVulnerability.bind(this);
        this.createFinding = this.createFinding.bind(this);
    }

    async processTransformations(scanId, rules, requests) {
        const findings = [];
        const batchSize = 10; // Process in batches to avoid memory issues

        try {
            // Process requests in batches
            for (let i = 0; i < requests.length; i += batchSize) {
                const requestBatch = requests.slice(i, i + batchSize);

                // Process each request with all rules
                const batchPromises = requestBatch.flatMap(request =>
                    rules.map(rule => this.processRequestWithRule(scanId, request, rule))
                );

                const batchResults = await Promise.allSettled(batchPromises);

                // Collect findings from successful transformations
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value) {
                        findings.push(result.value);
                    }
                });
            }

            return findings.filter(f => f !== null); // Remove null findings
        } catch (error) {
            console.error('Transformation processing error:', error);
            throw error;
        }
    }

    async processRequestWithRule(scanId, request, rule) {
        try {
            // Create transformed request document
            const transformedRequest = await this.createTransformedRequest(scanId, request, rule);

            // Apply transformations
            const transformedData = this.applyTransformations(request, rule);

            // Update with transformed data
            transformedRequest.transformed = {
                ...transformedData,
                appliedTransformations: this.getAppliedTransformations(rule)
            };

            // Execute the request
            const executionResult = await this.executeRequest(transformedData);
            transformedRequest.execution = executionResult;

            // Check for vulnerability
            const vulnerabilityCheck = this.checkVulnerability(executionResult, rule);
            transformedRequest.vulnerabilityDetected = vulnerabilityCheck.detected;
            transformedRequest.matchResults = vulnerabilityCheck.matchResults;

            // Save the transformed request
            await transformedRequest.save();

            // If vulnerability detected, create finding
            if (vulnerabilityCheck.detected) {
                return this.createFinding(request, rule, transformedRequest, vulnerabilityCheck);
            }

            return null;
        } catch (error) {
            console.error(`Error processing request ${request._id} with rule ${rule._id}:`, error);
            // Continue processing other transformations even if one fails
            return null;
        }
    }

    async createTransformedRequest(scanId, request, rule) {
        return await TransformedRequest.create({
            scanId,
            orgId: request.orgId,
            originalRequestId: request._id,
            ruleId: rule._id,
            original: {
                name: request.name,
                method: request.method,
                url: request.url,
                headers: request.headers,
                body: request.body,
                params: request.params
            }
        });
    }

    applyTransformations(request, rule) {
        // Start with a copy of the original request
        const transformed = {
            method: request.method,
            url: request.url,
            headers: { ...request.headers },
            body: request.body ? { ...request.body } : null,
            params: request.params ? { ...request.params } : {}
        };

        // Apply each transformation from the rule
        rule.request.operations.forEach(operation => {
            switch (operation.action) {
                case 'add_header':
                    transformed.headers[operation.key] = operation.value;
                    break;

                case 'modify_header':
                    if (transformed.headers[operation.key]) {
                        transformed.headers[operation.key] = operation.value;
                    }
                    break;

                case 'remove_header':
                    delete transformed.headers[operation.key];
                    break;

                case 'add_param':
                    transformed.params[operation.key] = operation.value;
                    break;

                case 'modify_param':
                    if (transformed.params[operation.key] !== undefined) {
                        transformed.params[operation.key] = operation.value;
                    }
                    break;

                case 'remove_param':
                    delete transformed.params[operation.key];
                    break;

                case 'modify_body':
                    if (transformed.body) {
                        this.modifyBodyField(transformed.body, operation.key, operation.value);
                    }
                    break;

                case 'override_url':
                    transformed.url = operation.value;
                    break;

                case 'append_to_url':
                    transformed.url += operation.value;
                    break;

                case 'modify_method':
                    transformed.method = operation.value.toUpperCase();
                    break;
            }
        });

        // Build full URL with params if any
        if (Object.keys(transformed.params).length > 0) {
            const queryString = new URLSearchParams(transformed.params).toString();
            transformed.url += (transformed.url.includes('?') ? '&' : '?') + queryString;
        }

        return transformed;
    }

    modifyBodyField(body, path, value) {
        const keys = path.split('.');
        let current = body;

        for (let i = 0; i < keys.length - 1; i++) {
            if (current[keys[i]] === undefined) {
                return; // Path doesn't exist
            }
            current = current[keys[i]];
        }

        current[keys[keys.length - 1]] = value;
    }

    getAppliedTransformations(rule) {
        return rule.request.operations.map(op => ({
            operation: op.action,
            field: op.key,
            value: op.value,
            description: this.getOperationDescription(op)
        }));
    }

    getOperationDescription(operation) {
        const descriptions = {
            'add_header': `Added header ${operation.key}`,
            'modify_header': `Modified header ${operation.key}`,
            'remove_header': `Removed header ${operation.key}`,
            'add_param': `Added parameter ${operation.key}`,
            'modify_param': `Modified parameter ${operation.key}`,
            'remove_param': `Removed parameter ${operation.key}`,
            'modify_body': `Modified body field ${operation.key}`,
            'override_url': `Overrode URL`,
            'append_to_url': `Appended to URL`,
            'modify_method': `Changed method to ${operation.value}`
        };
        return descriptions[operation.action] || operation.action;
    }

    async executeRequest(transformedData) {
        const startTime = Date.now();

        try {
            const result = await requestExecutor.execute(transformedData);

            return {
                status: result.success ? 'success' : 'failed',
                startedAt: new Date(startTime),
                completedAt: new Date(),
                responseTime: Date.now() - startTime,
                request: result.request,
                response: result.response
            };
        } catch (error) {
            return {
                status: 'error',
                startedAt: new Date(startTime),
                completedAt: new Date(),
                responseTime: Date.now() - startTime,
                request: transformedData,
                response: {
                    error: error.message,
                    status: 0,
                    statusText: 'Request Failed'
                }
            };
        }
    }

    checkVulnerability(executionResult, rule) {
        const matchResults = {
            matched: false,
            matchedCriteria: null,
            details: {}
        };

        // If request failed, no vulnerability check
        if (executionResult.status !== 'success') {
            return { detected: false, matchResults };
        }

        const response = executionResult.response;

        // Check each match condition
        for (const condition of rule.response.match.conditions) {
            let isMatch = false;

            switch (condition.type) {
                case 'status_code':
                    isMatch = this.checkStatusCode(response.status, condition.operator, condition.value);
                    break;

                case 'response_time':
                    isMatch = this.checkResponseTime(executionResult.responseTime, condition.operator, condition.value);
                    break;

                case 'body_contains':
                    isMatch = this.checkBodyContains(response.body, condition.value);
                    break;

                case 'body_regex':
                    isMatch = this.checkBodyRegex(response.body, condition.value);
                    break;

                case 'header_exists':
                    isMatch = this.checkHeaderExists(response.headers, condition.key);
                    break;

                case 'header_value':
                    isMatch = this.checkHeaderValue(response.headers, condition.key, condition.operator, condition.value);
                    break;

                case 'response_size':
                    isMatch = this.checkResponseSize(response.size, condition.operator, condition.value);
                    break;
            }

            if (isMatch) {
                matchResults.matched = true;
                matchResults.matchedCriteria = `${condition.type}: ${condition.description || condition.value}`;
                matchResults.details = condition;
                break; // First match wins
            }
        }

        return {
            detected: matchResults.matched,
            matchResults
        };
    }

    checkStatusCode(actual, operator, expected) {
        const expectedNum = parseInt(expected);
        switch (operator) {
            case 'equals': return actual === expectedNum;
            case 'not_equals': return actual !== expectedNum;
            case 'greater_than': return actual > expectedNum;
            case 'less_than': return actual < expectedNum;
            case 'in_range':
                const [min, max] = expected.split('-').map(n => parseInt(n));
                return actual >= min && actual <= max;
            default: return false;
        }
    }

    checkResponseTime(actual, operator, expected) {
        const expectedNum = parseInt(expected);
        switch (operator) {
            case 'greater_than': return actual > expectedNum;
            case 'less_than': return actual < expectedNum;
            default: return false;
        }
    }

    checkBodyContains(body, searchValue) {
        if (!body) return false;
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        return bodyStr.toLowerCase().includes(searchValue.toLowerCase());
    }

    checkBodyRegex(body, pattern) {
        if (!body) return false;
        try {
            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
            const regex = new RegExp(pattern, 'i');
            return regex.test(bodyStr);
        } catch (error) {
            console.error('Invalid regex pattern:', pattern);
            return false;
        }
    }

    checkHeaderExists(headers, headerName) {
        return headers && headers[headerName.toLowerCase()] !== undefined;
    }

    checkHeaderValue(headers, headerName, operator, expectedValue) {
        if (!headers) return false;
        const actualValue = headers[headerName.toLowerCase()];
        if (!actualValue) return false;

        switch (operator) {
            case 'equals': return actualValue === expectedValue;
            case 'not_equals': return actualValue !== expectedValue;
            case 'contains': return actualValue.includes(expectedValue);
            case 'not_contains': return !actualValue.includes(expectedValue);
            default: return false;
        }
    }

    checkResponseSize(actual, operator, expected) {
        const expectedNum = parseInt(expected);
        switch (operator) {
            case 'greater_than': return actual > expectedNum;
            case 'less_than': return actual < expectedNum;
            default: return false;
        }
    }

    createFinding(request, rule, transformedRequest, vulnerabilityCheck) {
        return {
            ruleId: rule._id,
            ruleName: rule.ruleName,
            requestId: request._id,
            requestName: request.name,
            requestUrl: request.url,
            method: request.method,
            vulnerability: {
                type: rule.report.vulnerabilityType,
                severity: rule.report.severity,
                description: rule.report.description,
                evidence: {
                    request: transformedRequest.execution.request,
                    response: {
                        status: transformedRequest.execution.response.status,
                        statusText: transformedRequest.execution.response.statusText,
                        headers: transformedRequest.execution.response.headers,
                        // Truncate body if too large
                        body: this.truncateResponseBody(transformedRequest.execution.response.body)
                    },
                    matchedCriteria: vulnerabilityCheck.matchResults.matchedCriteria
                }
            },
            detectedAt: new Date()
        };
    }

    truncateResponseBody(body) {
        if (!body) return null;

        const maxLength = 5000; // 5KB limit for response body in findings
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

        if (bodyStr.length <= maxLength) {
            return body;
        }

        // Truncate and add indicator
        return bodyStr.substring(0, maxLength) + '... [truncated]';
    }

    handleError(error) {
        console.error('TransformerService Error:', error);

        if (error instanceof ApiError) {
            throw error;
        }

        throw ApiError.internal('An error occurred during transformation process');
    }
}