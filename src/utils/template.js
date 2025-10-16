/**
 * Template utility for dynamic placeholder substitution in vulnerability reports
 * Supports nested property access and null-safe navigation
 */

export class TemplateEngine {
    /**
     * Process a template string with placeholders
     * @param {string} template - Template string with {{placeholders}}
     * @param {Object} context - Data context for substitution
     * @returns {string} - Processed string with substituted values
     */
    static process(template, context) {
        if (!template || typeof template !== 'string') {
            return template;
        }

        // Regular expression to match {{variable}} patterns
        const placeholderRegex = /\{\{([^}]+)\}\}/g;

        return template.replace(placeholderRegex, (match, path) => {
            // Trim whitespace from the path
            const cleanPath = path.trim();

            // Get the value from context
            const value = this.getNestedValue(context, cleanPath);

            // Return the value or the original placeholder if not found
            return value !== undefined && value !== null ? String(value) : match;
        });
    }

    /**
     * Safely get nested property value from an object
     * @param {Object} obj - Source object
     * @param {string} path - Dot-notation path (e.g., 'req.headers.Authorization')
     * @returns {*} - Value at path or undefined
     */
    static getNestedValue(obj, path) {
        if (!obj || !path) return undefined;

        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (current === undefined) {
                return undefined;
            }
            if (current === null) {
                // Can't access properties of null
                return undefined;
            }

            // Handle array index notation like 'transformations[0]'
            const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);

            if (arrayMatch) {
                const [, arrayName, index] = arrayMatch;
                const array = current[arrayName];
                if (Array.isArray(array)) {
                    current = array[parseInt(index, 10)];
                } else {
                    // The property is not an array
                    return undefined;
                }
            } else {
                current = current[part];
            }
        }
        
        return current;
    }

    /**
     * Process multiple template fields in an object
     * @param {Object} fields - Object with template strings as values
     * @param {Object} context - Data context for substitution
     * @returns {Object} - Object with processed values
     */
    static processFields(fields, context) {
        const processed = {};

        for (const [key, value] of Object.entries(fields)) {
            if (typeof value === 'string') {
                processed[key] = this.process(value, context);
            } else if (Array.isArray(value)) {
                // Handle arrays (e.g., stepsToReproduce might be an array)
                processed[key] = value.map(item =>
                    typeof item === 'string' ? this.process(item, context) : item
                );
            } else {
                processed[key] = value;
            }
        }

        return processed;
    }

    /**
     * Create a context object for vulnerability report templates
     * @param {Object} params - Parameters object
     * @returns {Object} - Formatted context for template processing
     */
    static createVulnerabilityContext(params) {
        const { transformedRequest, originalRequest, response, rule, matchResult } = params;

        // Build the context object with all available data
        const context = {
            // Transformed request data
            req: {
                method: transformedRequest.method,
                url: transformedRequest.url,
                headers: transformedRequest.headers || {},
                body: transformedRequest.body,
                params: transformedRequest.params || {},
                // Make individual headers easily accessible
                ...(transformedRequest.headers && {
                    header: transformedRequest.headers
                })
            },

            // Original request data
            original: {
                name: originalRequest.name,
                method: originalRequest.method,
                url: originalRequest.url,
                collectionName: originalRequest.collectionName,
                folderName: originalRequest.folderName,
                workspaceName: originalRequest.workspaceName,
                description: originalRequest.description
            },

            // Response data
            res: {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers || {},
                body: response.body,
                responseTime: response.time,
                size: response.size,
                // Make individual headers easily accessible
                ...(response.headers && {
                    header: response.headers
                })
            },

            // Rule data
            rule: {
                name: rule.rule_name,
                category: rule.category,
                severity: rule.parsed_yaml?.report?.severity || rule.report?.severity,
                type: rule.parsed_yaml?.report?.vulnerabilityType || rule.report?.vulnerabilityType
            },

            // Match result data
            match: matchResult ? {
                matched: matchResult.matched,
                criteria: matchResult.matchedCriteria?.type,
                expected: matchResult.matchedCriteria?.expected,
                actual: matchResult.matchedCriteria?.actual,
                operator: matchResult.matchedCriteria?.operator,
                description: matchResult.matchedCriteria?.description
            } : {},

            // Applied transformations
            transformations: transformedRequest.appliedTransformations || [],

            // Computed values
            endpoint: transformedRequest.url ? new URL(transformedRequest.url).pathname : '',
            host: transformedRequest.url ? new URL(transformedRequest.url).host : '',

            // Scan metadata
            scan: {
                name: params.scanName,
                id: params.scanId
            }
        };

        // Add transformation summary if available
        if (context.transformations.length > 0) {
            context.transformationSummary = context.transformations
                .map(t => t.description || `${t.operation} ${t.field}`)
                .join(', ');
        }

        return context;
    }

    /**
     * Format a value for display in reports
     * @param {*} value - Value to format
     * @returns {string} - Formatted string
     */
    static formatValue(value) {
        if (value === undefined || value === null) {
            return 'N/A';
        }
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    }
}

// Export as default for convenience
export default TemplateEngine;