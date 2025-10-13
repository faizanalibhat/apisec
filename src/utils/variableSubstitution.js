/**
 * Utility for substituting {{variable}} placeholders with actual values from environment
 */

/**
 * Recursively substitute variables in any value (string, object, array)
 * @param {*} value - The value to process
 * @param {Object} variables - Key-value pairs of variables
 * @returns {*} - The processed value
 */
function substituteValue(value, variables) {
    if (typeof value === 'string') {
        // Replace all {{variable}} patterns
        return value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            // If variable exists, use its value, otherwise keep the placeholder
            return variables.hasOwnProperty(varName) ? variables[varName] : match;
        });
    } else if (Array.isArray(value)) {
        // Process each array element
        return value.map(item => substituteValue(item, variables));
    } else if (value && typeof value === 'object') {
        // Process each object property
        const result = {};
        for (const [key, val] of Object.entries(value)) {
            // Also substitute in keys (though less common)
            const newKey = substituteValue(key, variables);
            result[newKey] = substituteValue(val, variables);
        }
        return result;
    }
    // Return primitives as-is
    return value;
}

/**
 * Substitute variables in headers object
 * @param {Object} headers - Headers object
 * @param {Object} variables - Environment variables
 * @returns {Object} - Processed headers
 */
function substituteHeaders(headers, variables) {
    if (!headers || typeof headers !== 'object') {
        return headers;
    }

    const result = {};
    for (const [key, value] of Object.entries(headers)) {
        // Substitute in both header names and values
        const newKey = substituteValue(key, variables);
        const newValue = substituteValue(value, variables);
        result[newKey] = newValue;
    }
    return result;
}

/**
 * Main function to substitute variables in a request object
 * @param {Object} request - The raw request object
 * @param {Object} variables - Environment variables as key-value pairs
 * @returns {Object} - The request with substituted variables
 */
export function substituteVariables(request, variables) {
    if (!variables || Object.keys(variables).length === 0) {
        // No variables to substitute
        return request;
    }

    const substituted = { ...request };

    // Substitute in URL
    if (substituted.url) {
        substituted.url = substituteValue(substituted.url, variables);
    }

    // Substitute in headers
    if (substituted.headers) {
        substituted.headers = substituteHeaders(substituted.headers, variables);
    }

    // Substitute in query parameters
    if (substituted.params) {
        substituted.params = substituteValue(substituted.params, variables);
    }

    // Substitute in request body
    if (substituted.body) {
        substituted.body = substituteValue(substituted.body, variables);
    }

    // Substitute in any auth configurations
    if (substituted.auth) {
        substituted.auth = substituteValue(substituted.auth, variables);
    }

    // Log substitution for debugging
    console.log(`[+] Variable substitution completed for request: ${substituted.name || substituted.url}`);

    return substituted;
}

/**
 * Get a list of all variables used in a request
 * @param {Object} request - The request object
 * @returns {Array} - Array of variable names found
 */
export function extractVariables(request) {
    const variables = new Set();
    const pattern = /\{\{(\w+)\}\}/g;

    function extract(value) {
        if (typeof value === 'string') {
            let match;
            while ((match = pattern.exec(value)) !== null) {
                variables.add(match[1]);
            }
        } else if (Array.isArray(value)) {
            value.forEach(item => extract(item));
        } else if (value && typeof value === 'object') {
            Object.values(value).forEach(val => extract(val));
        }
    }

    // Extract from all request fields
    extract(request.url);
    extract(request.headers);
    extract(request.params);
    extract(request.body);
    extract(request.auth);

    return Array.from(variables);
}

/**
 * Validate that all required variables are present in the environment
 * @param {Object} request - The request object
 * @param {Object} variables - Available environment variables
 * @returns {Object} - { valid: boolean, missing: Array }
 */
export function validateVariables(request, variables) {
    const required = extractVariables(request);
    const missing = required.filter(varName => !variables.hasOwnProperty(varName));
    
    return {
        valid: missing.length === 0,
        missing
    };
}