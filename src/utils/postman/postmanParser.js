import { ApiError } from '../ApiError.js';

class PostmanParser {
    constructor() {
        this.variablePattern = /\{\{([^}]+)\}\}/g;
    }

    // Extract query parameters
    extractQueryParams(queryArray) {
        if (!Array.isArray(queryArray)) {
            return [];
        }

        return queryArray.map(param => ({
            key: param.key || '',
            value: param.value || '',
            disabled: param.disabled || false
        }));
    }

    // Extract headers with special handling for authorization
    extractHeaders(headers = []) {
        return headers.map(h => ({
            key: h.key || '',
            value: h.value || '',
            type: h.type || 'text',
            disabled: h.disabled || false
        }));
    }

    // Extract body based on mode
    extractBody(bodyObj) {
        if (!bodyObj || bodyObj.disabled) {
            return null;
        }

        const body = {
            mode: bodyObj.mode,
            content: null
        };

        switch (bodyObj.mode) {
            case 'raw':
                body.content = bodyObj.raw || '';
                body.options = bodyObj.options || {};
                break;
            case 'urlencoded':
                body.content = bodyObj.urlencoded || [];
                break;
            case 'formdata':
                body.content = bodyObj.formdata || [];
                break;
            case 'file':
                body.content = { src: bodyObj.file?.src || null };
                break;
            case 'graphql':
                body.content = bodyObj.graphql || {};
                break;
            default:
                return null;
        }

        return body;
    }

    // Build raw HTTP request string
    buildRawRequest(method, url, headers, body, queryParams) {
        let raw = `${method.toUpperCase()} ${url}`;

        // Add query parameters
        if (queryParams && queryParams.length > 0) {
            const enabledParams = queryParams.filter(p => !p.disabled);
            if (enabledParams.length > 0) {
                const queryString = enabledParams
                    .map(p => `${p.key}=${p.value}`)
                    .join('&');
                raw += `?${queryString}`;
            }
        }

        raw += ' HTTP/1.1\n';

        // Add headers
        const enabledHeaders = headers.filter(h => !h.disabled);
        for (const header of enabledHeaders) {
            raw += `${header.key}: ${header.value}\n`;
        }

        // Add body if exists
        if (body && body.content) {
            raw += '\n';

            switch (body.mode) {
                case 'raw':
                    raw += body.content;
                    break;
                case 'urlencoded':
                    if (Array.isArray(body.content)) {
                        raw += body.content
                            .filter(p => !p.disabled)
                            .map(p => `${p.key}=${p.value}`)
                            .join('&');
                    }
                    break;
                case 'formdata':
                    // Simplified representation
                    raw += '[FormData]\n';
                    if (Array.isArray(body.content)) {
                        body.content
                            .filter(p => !p.disabled)
                            .forEach(p => {
                                raw += `${p.key}: ${p.type === 'file' ? '[File]' : p.value}\n`;
                            });
                    }
                    break;
                case 'file':
                    raw += '[Binary File Content]';
                    break;
                case 'graphql':
                    raw += JSON.stringify(body.content, null, 2);
                    break;
            }
        }

        return raw;
    }

    // Parse URL to extract components
    parseUrl(url, context) {
        if (!url) return null;

        console.log("[+] INSIDE PARSE URL: ", context?.variables);

        // Handle string URL
        if (typeof url === 'string') {
            try {
                const urlObj = new URL(url.includes('://') ? url : `https://${url}`);

                return {
                    // protocol: urlObj.protocol.replace(':', ''),
                    // host: urlObj.host || context?.variables?.base_url,
                    host: urlObj.host,
                    port: urlObj.port,
                    path: urlObj.pathname,
                    query: urlObj.search
                };
            } catch (e) {
                return {
                    protocol: 'https',
                    host: urlObj.host,
                    path: '/',
                    query: ''
                };
            }
        }

        // Handle Postman URL object
        if (url.raw) {
            return this.parseUrl(url.raw, context);
        }

        // Handle structured URL
        return {
            protocol: url.protocol || 'https',
            host: Array.isArray(url.host) ? url.host.join('.') : (url.host || ''),
            port: url.port,
            path: Array.isArray(url.path) ? `/${url.path.join('/')}` : (url.path || '/'),
            query: url.query ? '?' + url.query.map(q => `${q.key}=${q.value}`).join('&') : ''
        };
    }

    // Resolve variables in text
    resolveVariables(text, variables = {}) {
        if (!text || typeof text !== 'string') return text;

        return text.replace(this.variablePattern, (match, varName) => {
            return variables[varName.trim()] || match;
        });
    }

    // Parse folder structure recursively
    parseItems(items, context, parentPath = '') {
        const requests = [];

        for (const item of items) {
            // If item has a request, it's an endpoint
            if (item.request) {
                const request = this.parseRequest(item, context, parentPath);
                if (request) {
                    requests.push(request);
                }
            }

            // If item has sub-items, it's a folder
            if (item.item && Array.isArray(item.item)) {
                const folderPath = parentPath ? `${parentPath}/${item.name}` : item.name;
                const subRequests = this.parseItems(item.item, context, folderPath);
                requests.push(...subRequests);
            }
        }

        return requests;
    }

    // Parse individual request
    parseRequest(item, context, folderPath) {
        try {
            const request = item.request;
            if (!request) return null;

            const headers = this.extractHeaders(request.header);
            const body = this.extractBody(request.body);
            const queryParams = this.extractQueryParams(request.url?.query);

            // Build the full URL
            const fullUrl = (request.url && request.url.raw) ? request.url.raw : '';

            // Build raw request
            const rawRequest = this.buildRawRequest(
                request.method || 'GET',
                fullUrl,
                headers,
                body,
                queryParams
            );

            // Convert headers array to Map format for MongoDB
            const headersMap = {};
            headers.filter(h => !h.disabled).forEach(h => {
                headersMap[h.key] = h.value;
            });

            // Convert params array to Map format for MongoDB
            const paramsMap = {};
            queryParams.filter(p => !p.disabled).forEach(p => {
                paramsMap[p.key] = p.value;
            });

            // Extract body content based on mode
            let bodyContent = null;
            if (body && body?.content) {
                // if (body.mode == "raw" && body?.options?.raw?.language == "json") {
                //     bodyContent = JSON.stringify(body.content);
                // }
                if (body?.mode === 'raw') {
                    bodyContent = body?.content;
                } else if (body?.mode === 'urlencoded' || body?.mode === 'formdata') {
                    bodyContent = body?.content;
                } else if (body?.mode === 'graphql') {
                    bodyContent = body?.content;
                } else if (body.mode === 'file') {
                    bodyContent = body?.content;
                }
            }

            const body_format = body?.mode == "raw" ? body?.options?.raw?.language : body?.mode || "unknown";

            return {
                // Required fields with correct names
                orgId: context.orgId,
                integrationId: context.integrationId,
                name: item.name || request.name || 'Unnamed Request',
                method: (request.method || 'GET').toUpperCase(),
                url: fullUrl,
                rawHttp: rawRequest,
                collectionName: context.collectionName,
                workspaceName: context.workspaceName,
                collectionUid: context.collectionUid,
                workspaceId: context.workspaceId,

                // Optional fields
                headers: headersMap,
                params: paramsMap,
                body: bodyContent,
                body_format: body_format,
                folderName: folderPath || null,
                postmanId: item._postman_id || request._postman_id || null,
                description: request.description || item.description || null,

                // These will be set by Mongoose defaults
                // isEdited: false,
                // originalData: null
            };
        } catch (error) {
            console.error(`Error parsing request ${item.name}:`, error.message);
            return null;
        }
    }

    // Main parse method
    async parseCollection(collection, context) {
        try {
            if (!collection || !collection.item) {
                return [];
            }

            // Extract collection variables
            const collectionVariables = {};
            if (collection.variable && Array.isArray(collection.variable)) {
                collection.variable.forEach(v => {
                    if (v.key && v.value) {
                        collectionVariables[v.key] = v.value;
                    }
                });
            }

            // Merge with environment variables from context
            const allVariables = {
                ...collectionVariables,
                ...(context.environmentVariables || {}),
                ...(context.envs || {})
            };

            // Add collection info to context
            const enrichedContext = {
                ...context,
                collectionName: collection.info?.name || 'Unknown Collection',
                collectionId: collection.info?._postman_id || context.collectionId,
                collectionUid: context.collectionId,
                variables: allVariables
            };

            // Parse all items recursively
            const requests = this.parseItems(collection.item, enrichedContext);

            // Resolve variables in all requests
            // const resolvedRequests = requests.map(req => {
            //     if (!req) return null;

            //     // Resolve variables in URL
            //     req.url = this.resolveVariables(req.url, allVariables);

            //     // Resolve in headers (Map format)
            //     if (req.headers) {
            //         const resolvedHeaders = {};
            //         Object.entries(req.headers).forEach(([key, value]) => {
            //             resolvedHeaders[key] = this.resolveVariables(value, allVariables);
            //         });
            //         req.headers = resolvedHeaders;
            //     }

            //     // Resolve in params (Map format)
            //     if (req.params) {
            //         const resolvedParams = {};
            //         Object.entries(req.params).forEach(([key, value]) => {
            //             resolvedParams[key] = this.resolveVariables(value, allVariables);
            //         });
            //         req.params = resolvedParams;
            //     }

            //     // Update raw HTTP with resolved values
            //     req.rawHttp = this.buildRawRequest(
            //         req.method,
            //         req.url,
            //         Object.entries(req.headers || {}).map(([key, value]) => ({
            //             key,
            //             value,
            //             disabled: false
            //         })),
            //         req.body ? { mode: 'raw', content: req.body } : null,
            //         Object.entries(req.params || {}).map(([key, value]) => ({
            //             key,
            //             value,
            //             disabled: false
            //         }))
            //     );

            //     return req;
            // });

            // Filter out any null requests
            return requests.filter(req => req !== null);
        } catch (error) {
            console.error('Error parsing collection:', error);
            throw ApiError.internal(`Failed to parse Postman collection: ${error.message}`);
        }
    }

    // Utility method to validate parsed request
    validateRequest(request) {
        const required = ['name', 'method', 'url', 'host'];
        const missing = required.filter(field => !request[field]);

        if (missing.length > 0) {
            console.warn(`Request ${request.name || 'unknown'} missing fields: ${missing.join(', ')}`);
            return false;
        }

        return true;
    }

    // Get summary of parsed collection
    getCollectionSummary(requests) {
        const summary = {
            totalRequests: requests.length,
            methods: {},
            folders: new Set(),
            hasAuth: 0
        };

        requests.forEach(req => {
            // Count methods
            summary.methods[req.method] = (summary.methods[req.method] || 0) + 1;

            // Collect folders
            if (req.folder_name && req.folder_name !== 'Root') {
                summary.folders.add(req.folder_name);
            }

            // Count auth
            if (req.auth) {
                summary.hasAuth++;
            }
        });

        summary.folders = Array.from(summary.folders);
        return summary;
    }
}

export { PostmanParser };