import { PostmanParser } from '../postman/postmanParser.js';

class SwaggerParser {
    constructor() {
        this.postmanParser = new PostmanParser();
    }

    /**
     * Extract basic info from Swagger/OpenAPI spec
     */
    extractBasicInfo(spec) {
        const isOpenApi3 = spec.openapi && spec.openapi.startsWith('3.');

        let info = {
            title: spec.info?.title || 'Untitled API',
            version: spec.info?.version || '1.0.0',
            description: spec.info?.description || '',
            totalEndpoints: 0
        };

        if (isOpenApi3) {
            info.servers = spec.servers || [];
        } else {
            info.host = spec.host || 'localhost';
            info.basePath = spec.basePath || '/';
            info.schemes = spec.schemes || ['http'];
        }

        // Count endpoints
        if (spec.paths) {
            Object.values(spec.paths).forEach(pathItem => {
                const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
                methods.forEach(method => {
                    if (pathItem[method]) info.totalEndpoints++;
                });
            });
        }

        return info;
    }

    /**
     * Create environment variables from Swagger spec
     */
    createEnvironmentFromSpec(spec) {
        const variables = [];
        const isOpenApi3 = spec.openapi && spec.openapi.startsWith('3.');

        // Add base URL variable
        if (isOpenApi3 && spec.servers && spec.servers.length > 0) {
            variables.push({
                key: 'baseUrl',
                value: spec.servers[0].url,
                type: 'text',
                enabled: true
            });

            // Add server-specific variables from server variables
            spec.servers.forEach((server, index) => {
                if (server.variables) {
                    Object.entries(server.variables).forEach(([key, varDef]) => {
                        variables.push({
                            key: `server${index}_${key}`,
                            value: varDef.default || '',
                            type: 'text',
                            enabled: true,
                            description: varDef.description
                        });
                    });
                }
            });
        } else {
            // Swagger 2.0
            const scheme = spec.schemes ? spec.schemes[0] : 'http';
            const host = spec.host || 'localhost';
            const basePath = spec.basePath || '';
            variables.push({
                key: 'baseUrl',
                value: `${scheme}://${host}${basePath}`,
                type: 'text',
                enabled: true
            });
        }

        // Extract path parameters as variables
        const pathParams = new Set();
        if (spec.paths) {
            Object.keys(spec.paths).forEach(path => {
                const matches = path.match(/\{([^}]+)\}/g);
                if (matches) {
                    matches.forEach(match => {
                        const paramName = match.slice(1, -1);
                        pathParams.add(paramName);
                    });
                }
            });
        }

        pathParams.forEach(param => {
            variables.push({
                key: param,
                value: '',
                type: 'text',
                enabled: true,
                description: `Path parameter: ${param}`
            });
        });

        // Add common auth variables
        if (spec.securityDefinitions || spec.components?.securitySchemes) {
            const securitySchemes = spec.securityDefinitions || spec.components?.securitySchemes;

            Object.entries(securitySchemes).forEach(([name, scheme]) => {
                if (scheme.type === 'apiKey') {
                    variables.push({
                        key: `${name}_apiKey`,
                        value: '',
                        type: 'text',
                        enabled: true,
                        description: `API Key for ${name}`
                    });
                } else if (scheme.type === 'oauth2' || scheme.type === 'http' && scheme.scheme === 'bearer') {
                    variables.push({
                        key: `${name}_token`,
                        value: '',
                        type: 'text',
                        enabled: true,
                        description: `Bearer token for ${name}`
                    });
                }
            });
        }

        return variables;
    }

    /**
     * Parse Swagger/OpenAPI spec into raw requests
     */
    async parseSwaggerToRawRequests(spec, context) {
        const { orgId, integrationId, integrationName } = context;
        const rawRequests = [];
        const isOpenApi3 = spec.openapi && spec.openapi.startsWith('3.');

        if (!spec.paths) {
            return rawRequests;
        }

        // Get base URL template
        let baseUrlTemplate = '{{baseUrl}}';

        Object.entries(spec.paths).forEach(([path, pathItem]) => {
            // Handle path-level parameters
            const pathParameters = pathItem.parameters || [];

            // Process each HTTP method
            ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(method => {
                const operation = pathItem[method];
                if (!operation) return;

                // Merge path and operation parameters
                const allParameters = [...pathParameters, ...(operation.parameters || [])];

                // Build request object
                const requestData = {
                    orgId,
                    integrationId,
                    source: 'swagger',
                    name: operation.summary || `${method.toUpperCase()} ${path}`,
                    description: operation.description || null,
                    method: method.toUpperCase(),
                    url: `${baseUrlTemplate}${path}`,
                    collectionName: integrationName || 'Swagger API',
                    folderName: operation.tags ? operation.tags[0] : null,
                    workspaceName: 'Swagger Import',
                    headers: {},
                    params: {},
                    body: null,
                    body_format: null,
                    swaggerMetadata: {
                        operationId: operation.operationId,
                        tags: operation.tags || [],
                        summary: operation.summary,
                        description: operation.description,
                        deprecated: operation.deprecated || false,
                        security: operation.security || spec.security || [],
                        pathPattern: path
                    }
                };

                // Process parameters
                const pathParams = {};
                const queryParams = {};
                const headerParams = {};

                allParameters.forEach(param => {
                    // Skip if it's a reference (not resolved)
                    if (param.$ref) return;

                    const paramValue = `{{${param.name}}}`;

                    switch (param.in) {
                        case 'path':
                            pathParams[param.name] = paramValue;
                            break;
                        case 'query':
                            queryParams[param.name] = paramValue;
                            break;
                        case 'header':
                            headerParams[param.name] = paramValue;
                            requestData.headers[param.name] = paramValue;
                            break;
                    }
                });

                // Add query params to URL if any
                if (Object.keys(queryParams).length > 0) {
                    const queryString = Object.entries(queryParams)
                        .map(([key, value]) => `${key}=${value}`)
                        .join('&');
                    requestData.url += `?${queryString}`;
                }

                // Store params for reference
                requestData.params = { ...pathParams, ...queryParams };

                // Process request body
                if (operation.requestBody || allParameters.find(p => p.in === 'body')) {
                    requestData.body_format = 'json'; // default

                    if (isOpenApi3 && operation.requestBody) {
                        // OpenAPI 3.0
                        const content = operation.requestBody.content;
                        if (content) {
                            if (content['application/json']) {
                                requestData.headers['Content-Type'] = 'application/json';
                                requestData.body = this.generateExampleBody(content['application/json'].schema);
                                requestData.body_format = 'json';
                            } else if (content['application/x-www-form-urlencoded']) {
                                requestData.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                                requestData.body = this.generateExampleBody(content['application/x-www-form-urlencoded'].schema);
                                requestData.body_format = 'urlencoded';
                            } else if (content['multipart/form-data']) {
                                requestData.headers['Content-Type'] = 'multipart/form-data';
                                requestData.body = this.generateExampleBody(content['multipart/form-data'].schema);
                                requestData.body_format = 'formdata';
                            }
                        }
                    } else {
                        // Swagger 2.0
                        const bodyParam = allParameters.find(p => p.in === 'body');
                        if (bodyParam && bodyParam.schema) {
                            requestData.headers['Content-Type'] = 'application/json';
                            requestData.body = this.generateExampleBody(bodyParam.schema);
                            requestData.body_format = 'json';
                        }

                        // Handle consumes
                        if (operation.consumes && operation.consumes.length > 0) {
                            requestData.headers['Content-Type'] = operation.consumes[0];
                            if (operation.consumes[0].includes('form')) {
                                requestData.body_format = 'urlencoded';
                            }
                        }
                    }
                }

                // Process produces/Accept header
                if (isOpenApi3 && operation.responses) {
                    // Look for first success response with content
                    const successResponses = ['200', '201', '202', '204'];
                    for (const status of successResponses) {
                        if (operation.responses[status]?.content) {
                            const contentTypes = Object.keys(operation.responses[status].content);
                            if (contentTypes.length > 0) {
                                requestData.headers['Accept'] = contentTypes[0];
                                break;
                            }
                        }
                    }
                } else if (operation.produces && operation.produces.length > 0) {
                    requestData.headers['Accept'] = operation.produces[0];
                }

                // Add security headers based on spec
                this.addSecurityHeaders(requestData, operation.security || spec.security, spec);

                // Add Swagger-specific metadata to headers
                if (isOpenApi3) {
                    requestData.swaggerMetadata.servers = spec.servers;
                } else {
                    requestData.swaggerMetadata.host = spec.host;
                    requestData.swaggerMetadata.basePath = spec.basePath;
                    requestData.swaggerMetadata.schemes = spec.schemes;
                }

                // Build raw HTTP request
                requestData.rawHttp = this.postmanParser.buildRawRequest(
                    requestData.method,
                    requestData.url,
                    requestData.headers,
                    requestData.body,
                    []
                );

                rawRequests.push(requestData);
            });
        });

        return rawRequests;
    }

    /**
     * Generate example body from schema
     */
    generateExampleBody(schema) {
        if (!schema) return null;

        // If there's an example, use it
        if (schema.example !== undefined) {
            return schema.example;
        }

        // Generate based on type
        switch (schema.type) {
            case 'object':
                const obj = {};
                if (schema.properties) {
                    Object.entries(schema.properties).forEach(([key, propSchema]) => {
                        obj[key] = this.generateExampleBody(propSchema);
                    });
                }
                return obj;

            case 'array':
                if (schema.items) {
                    return [this.generateExampleBody(schema.items)];
                }
                return [];

            case 'string':
                if (schema.enum) return schema.enum[0];
                if (schema.format === 'date') return '2024-01-01';
                if (schema.format === 'date-time') return '2024-01-01T00:00:00Z';
                if (schema.format === 'email') return 'user@example.com';
                if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
                return 'string';

            case 'number':
            case 'integer':
                if (schema.enum) return schema.enum[0];
                return 0;

            case 'boolean':
                return false;

            default:
                return null;
        }
    }

    /**
     * Add security headers based on security requirements
     */
    addSecurityHeaders(requestData, security, spec) {
        if (!security || security.length === 0) return;

        const securitySchemes = spec.securityDefinitions || spec.components?.securitySchemes;
        if (!securitySchemes) return;

        security.forEach(requirement => {
            Object.keys(requirement).forEach(schemeName => {
                const scheme = securitySchemes[schemeName];
                if (!scheme) return;

                if (scheme.type === 'apiKey') {
                    if (scheme.in === 'header') {
                        requestData.headers[scheme.name] = `{{${schemeName}_apiKey}}`;
                    } else if (scheme.in === 'query') {
                        // Add to URL query params
                        const separator = requestData.url.includes('?') ? '&' : '?';
                        requestData.url += `${separator}${scheme.name}={{${schemeName}_apiKey}}`;
                    }
                } else if (scheme.type === 'http' && scheme.scheme === 'bearer') {
                    requestData.headers['Authorization'] = `Bearer {{${schemeName}_token}}`;
                } else if (scheme.type === 'http' && scheme.scheme === 'basic') {
                    requestData.headers['Authorization'] = `Basic {{${schemeName}_credentials}}`;
                } else if (scheme.type === 'oauth2') {
                    requestData.headers['Authorization'] = `Bearer {{${schemeName}_token}}`;
                }
            });
        });
    }
}

export { SwaggerParser };