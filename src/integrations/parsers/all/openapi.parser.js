
export class OpenApiParser {

    static parseRequests = async (spec, uid) => {
        const requests = [];
        const isOpenApi3 = spec.openapi?.startsWith('3.');

        if (!spec.paths) return requests;

        for (const [path, pathItem] of Object.entries(spec.paths)) {
            const pathParams = pathItem.parameters || [];

            for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
                const operation = pathItem[method];
                if (!operation) continue;

                const allParams = [...pathParams, ...(operation.parameters || [])];

                const request = {
                    source: 'swagger',
                    name: operation.summary || `${method.toUpperCase()} ${path}`,
                    description: operation.description || null,
                    method: method.toUpperCase(),
                    url: `{{baseUrl}}${path}`,
                    headers: {},
                    params: {},
                    body: null,
                    body_format: null,
                    folderName: operation.tags?.[0] || null,
                    swaggerMetadata: {
                        operationId: operation.operationId,
                        tags: operation.tags || [],
                        summary: operation.summary,
                        description: operation.description,
                        deprecated: operation.deprecated || false,
                        security: operation.security || spec.security || [],
                        pathPattern: path
                    },
                    collectionUid: uid
                };

                // Extract parameters (path, query, header)
                const queryParams = [];
                allParams.forEach(param => {
                    if (param.$ref) return;
                    const value = `{{${param.name}}}`;

                    if (param.in === 'path') {
                        request.params[param.name] = value;
                    } else if (param.in === 'query') {
                        request.params[param.name] = value;
                        queryParams.push(`${param.name}=${value}`);
                    } else if (param.in === 'header') {
                        request.headers[param.name] = value;
                    }
                });

                if (queryParams.length > 0) {
                    request.url += `?${queryParams.join('&')}`;
                }

                // Handle Request Body
                if (isOpenApi3 && operation.requestBody) {
                    const content = operation.requestBody.content || {};
                    const mediaTypes = [
                        { type: 'application/json', format: 'json' },
                        { type: 'application/x-www-form-urlencoded', format: 'urlencoded' },
                        { type: 'multipart/form-data', format: 'formdata' }
                    ];

                    for (const { type, format } of mediaTypes) {
                        if (content[type]) {
                            request.headers['Content-Type'] = type;
                            request.body = this._generateExample(content[type].schema);
                            request.body_format = format;
                            break;
                        }
                    }
                } else {
                    const bodyParam = allParams.find(p => p.in === 'body');
                    if (bodyParam?.schema) {
                        request.headers['Content-Type'] = 'application/json';
                        request.body = this._generateExample(bodyParam.schema);
                        request.body_format = 'json';
                    }

                    if (operation.consumes?.[0]) {
                        const contentType = operation.consumes[0];
                        request.headers['Content-Type'] = contentType;
                        if (contentType.includes('form')) {
                            request.body_format = contentType.includes('urlencoded') ? 'urlencoded' : 'formdata';
                        }
                    }
                }

                // Handle Response Accept Header
                if (isOpenApi3 && operation.responses) {
                    const successCodes = ['200', '201', '202', '204'];
                    const successResponse = successCodes.find(code => operation.responses[code]?.content);
                    if (successResponse) {
                        const contentType = Object.keys(operation.responses[successResponse].content)[0];
                        if (contentType) request.headers['Accept'] = contentType;
                    }
                } else if (operation.produces?.[0]) {
                    request.headers['Accept'] = operation.produces[0];
                }

                // Apply Security Headers
                this._applySecurity(request, operation.security || spec.security, spec);

                // Build Raw HTTP Request String
                request.rawHttp = this._buildRaw(request);

                requests.push(request);
            }
        }
        return requests;
    }

    static parseEnvironments = async (spec) => {
        const variables = [];
        const isOpenApi3 = spec.openapi?.startsWith('3.');

        // 1. Base URL / Server Variables
        if (isOpenApi3 && spec.servers?.length > 0) {
            variables.push({
                key: 'baseUrl',
                value: spec.servers[0].url,
                type: 'default',
                enabled: true
            });

            spec.servers.forEach((server, i) => {
                if (server.variables) {
                    Object.entries(server.variables).forEach(([key, def]) => {
                        variables.push({
                            key: `server${i}_${key}`,
                            value: def.default || '',
                            type: 'default',
                            enabled: true,
                            description: def.description || `Server ${i} variable: ${key}`
                        });
                    });
                }
            });
        } else {
            const scheme = spec.schemes?.[0] || 'http';
            const host = spec.host || 'localhost';
            const basePath = spec.basePath || '';
            variables.push({
                key: 'baseUrl',
                value: `${scheme}://${host}${basePath}`,
                type: 'default',
                enabled: true
            });
        }

        // 2. Path Parameters as Variables
        const pathParams = new Set();
        Object.keys(spec.paths || {}).forEach(path => {
            const matches = path.match(/\{([^}]+)\}/g);
            matches?.forEach(m => pathParams.add(m.slice(1, -1)));
        });

        pathParams.forEach(param => {
            variables.push({
                key: param,
                value: '',
                type: 'default',
                enabled: true,
                description: `Path parameter: ${param}`
            });
        });

        // 3. Security Schemes as Variables
        const securitySchemes = spec.securityDefinitions || spec.components?.securitySchemes || {};
        Object.entries(securitySchemes).forEach(([name, scheme]) => {
            const varBase = { type: 'default', enabled: true };

            if (scheme.type === 'apiKey') {
                variables.push({ ...varBase, key: `${name}_apiKey`, value: '', description: `API Key for ${name}` });
            } else if (scheme.type === 'oauth2' || (scheme.type === 'http' && scheme.scheme === 'bearer')) {
                variables.push({ ...varBase, key: `${name}_token`, value: '', description: `Bearer token for ${name}` });
            } else if (scheme.type === 'http' && scheme.scheme === 'basic') {
                variables.push({ ...varBase, key: `${name}_credentials`, value: '', description: `Basic auth credentials for ${name}` });
            }
        });

        return {
            name: spec.info?.title || 'OpenAPI Environment',
            values: variables
        };
    }

    static parseCollections = async (spec) => {
        const isOpenApi3 = spec.openapi?.startsWith('3.');

        const info = {
            name: spec.info?.title || 'Untitled API',
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
        Object.values(spec.paths || {}).forEach(pathItem => {
            const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
            methods.forEach(m => {
                if (pathItem[m]) info.totalEndpoints++;
            });
        });

        return info;
    }

    // ================== PRIVATE HELPERS ================== //

    static _generateExample(schema) {
        if (!schema) return null;
        if (schema.example !== undefined) return schema.example;

        switch (schema.type) {
            case 'object':
                const obj = {};
                Object.entries(schema.properties || {}).forEach(([k, v]) => {
                    obj[k] = this._generateExample(v);
                });
                return obj;
            case 'array':
                return schema.items ? [this._generateExample(schema.items)] : [];
            case 'string':
                if (schema.enum) return schema.enum[0];
                const formats = {
                    'date': '2024-01-01',
                    'date-time': '2024-01-01T00:00:00Z',
                    'email': 'user@example.com',
                    'uuid': '123e4567-e89b-12d3-a456-426614174000'
                };
                return formats[schema.format] || 'string';
            case 'number':
            case 'integer':
                return schema.enum ? schema.enum[0] : 0;
            case 'boolean':
                return false;
            default:
                return null;
        }
    }

    static _applySecurity(req, security, spec) {
        if (!security?.length) return;
        const schemes = spec.securityDefinitions || spec.components?.securitySchemes || {};

        security.forEach(requirement => {
            Object.keys(requirement).forEach(name => {
                const scheme = schemes[name];
                if (!scheme) return;

                if (scheme.type === 'apiKey') {
                    if (scheme.in === 'header') {
                        req.headers[scheme.name] = `{{${name}_apiKey}}`;
                    } else if (scheme.in === 'query') {
                        const separator = req.url.includes('?') ? '&' : '?';
                        req.url += `${separator}${scheme.name}={{${name}_apiKey}}`;
                    }
                } else if (scheme.type === 'http' && (scheme.scheme === 'bearer' || scheme.scheme === 'basic')) {
                    const type = scheme.scheme === 'bearer' ? 'Bearer' : 'Basic';
                    const suffix = scheme.scheme === 'bearer' ? 'token' : 'credentials';
                    req.headers['Authorization'] = `${type} {{${name}_${suffix}}}`;
                } else if (scheme.type === 'oauth2') {
                    req.headers['Authorization'] = `Bearer {{${name}_token}}`;
                }
            });
        });
    }

    static _buildRaw(req) {
        let raw = `${req.method} ${req.url} HTTP/1.1\n`;

        // Add headers
        Object.entries(req.headers).forEach(([k, v]) => {
            raw += `${k}: ${v}\n`;
        });

        // Add body
        if (req.body) {
            raw += '\n';
            if (req.body_format === 'json') {
                raw += JSON.stringify(req.body, null, 2);
            } else if (req.body_format === 'urlencoded') {
                raw += Object.entries(req.body)
                    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                    .join('&');
            } else if (req.body_format === 'formdata') {
                raw += '[FormData]\n';
                Object.entries(req.body).forEach(([k, v]) => {
                    raw += `${k}: ${v}\n`;
                });
            } else {
                raw += typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            }
        }

        return raw;
    }
}