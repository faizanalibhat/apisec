import axios from 'axios';
import { ApiError } from '../ApiError.js';

class SwaggerClient {
    constructor() {
        this.axios = axios.create({
            timeout: 30000, // 30 seconds
            headers: {
                'Accept': 'application/json, application/yaml',
                'User-Agent': 'APISEC-Swagger-Client/1.0'
            }
        });
    }

    /**
     * Fetch and validate Swagger/OpenAPI spec from URL
     */
    async fetchSwaggerSpec(url) {
        try {
            const response = await this.axios.get(url);
            
            let spec = response.data;
            
            // If response is string, try to parse as JSON
            if (typeof spec === 'string') {
                try {
                    spec = JSON.parse(spec);
                } catch (e) {
                    throw ApiError.badRequest('Invalid JSON format in Swagger specification');
                }
            }

            // Validate it's a valid Swagger/OpenAPI spec
            const validation = this.validateSpec(spec);
            if (!validation.valid) {
                throw ApiError.badRequest(`Invalid Swagger specification: ${validation.error}`);
            }

            return {
                spec,
                version: validation.version,
                info: validation.info
            };
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            if (error.response) {
                if (error.response.status === 404) {
                    throw ApiError.notFound('Swagger specification not found at the provided URL');
                } else if (error.response.status === 401 || error.response.status === 403) {
                    throw ApiError.unauthorized('Authentication required to access the Swagger specification');
                } else {
                    throw ApiError.badRequest(`Failed to fetch Swagger specification: ${error.response.statusText}`);
                }
            } else if (error.request) {
                throw ApiError.badRequest('Unable to reach the Swagger URL. Please check the URL and try again.');
            } else {
                throw ApiError.internal('An error occurred while fetching the Swagger specification');
            }
        }
    }

    /**
     * Validate if URL contains valid Swagger/OpenAPI spec
     */
    async validateUrl(url) {
        try {
            const result = await this.fetchSwaggerSpec(url);
            return {
                valid: true,
                version: result.version,
                info: result.info
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Validate Swagger/OpenAPI specification structure
     */
    validateSpec(spec) {
        if (!spec || typeof spec !== 'object') {
            return { valid: false, error: 'Specification must be a valid object' };
        }

        // Check for OpenAPI 3.0
        if (spec.openapi && typeof spec.openapi === 'string') {
            if (!spec.openapi.startsWith('3.')) {
                return { valid: false, error: `Unsupported OpenAPI version: ${spec.openapi}` };
            }

            if (!spec.info) {
                return { valid: false, error: 'OpenAPI specification must contain info object' };
            }

            if (!spec.paths || Object.keys(spec.paths).length === 0) {
                return { valid: false, error: 'OpenAPI specification must contain at least one path' };
            }

            return {
                valid: true,
                version: 'openapi3',
                info: {
                    title: spec.info.title,
                    version: spec.info.version,
                    description: spec.info.description
                }
            };
        }

        // Check for Swagger 2.0
        if (spec.swagger === '2.0') {
            if (!spec.info) {
                return { valid: false, error: 'Swagger specification must contain info object' };
            }

            if (!spec.paths || Object.keys(spec.paths).length === 0) {
                return { valid: false, error: 'Swagger specification must contain at least one path' };
            }

            return {
                valid: true,
                version: 'swagger2',
                info: {
                    title: spec.info.title,
                    version: spec.info.version,
                    description: spec.info.description
                }
            };
        }

        return { valid: false, error: 'Specification must be either Swagger 2.0 or OpenAPI 3.x' };
    }

    /**
     * Resolve references in spec (simplified version)
     */
    resolveReferences(spec) {
        // This is a simplified implementation
        // In production, you might want to use a library like json-refs
        const resolved = JSON.parse(JSON.stringify(spec));
        
        // Basic $ref resolution within the same document
        const resolveRef = (obj, root) => {
            if (!obj || typeof obj !== 'object') return obj;

            if (obj.$ref && typeof obj.$ref === 'string') {
                const path = obj.$ref.replace('#/', '').split('/');
                let resolved = root;
                for (const segment of path) {
                    resolved = resolved[segment];
                    if (!resolved) break;
                }
                return resolved || obj;
            }

            for (const key in obj) {
                obj[key] = resolveRef(obj[key], root);
            }

            return obj;
        };

        return resolveRef(resolved, resolved);
    }
}

export { SwaggerClient };