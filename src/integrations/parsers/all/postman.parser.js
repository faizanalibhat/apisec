
export class PostmanParser {

    /**
     * Parse Postman collection into raw requests
     * @param {Object} collection - The Postman collection object
     * @returns {Promise<Array>} Array of parsed request objects
     */
    static parseRequests = async (collection) => {
        if (!collection || !collection.item) return [];
        return this._parseItems(collection.item, collection.info?.name || 'Postman Collection');
    }

    /**
     * Parse Postman environment into variable objects
     * @param {Object} environment - The Postman environment object
     * @returns {Promise<Array>} Array of environment variable objects
     */
    static parseEnvironments = async (environment) => {
        if (!environment) return null;

        return {
            name: environment.name,
            postmanUid: environment.uid,
            values: (environment.values || []).map(v => ({
                key: v.key,
                value: v.value,
                type: v.type || 'default',
                enabled: v.enabled !== false,
                description: v.description || ''
            }))
        };
    }

    /**
     * Extract collection metadata
     * @param {Object} collection - The Postman collection object
     * @returns {Promise<Object>} Metadata object
     */
    static parseCollections = async (collection) => {
        const info = collection.info || {};
        const items = collection.item || [];

        let totalEndpoints = 0;
        const countEndpoints = (items) => {
            items.forEach(item => {
                if (item.request) totalEndpoints++;
                if (item.item) countEndpoints(item.item);
            });
        };
        countEndpoints(items);

        return {
            name: info.name || 'Untitled Collection',
            version: '1.0.0', // Postman collections don't always have a version in info
            description: typeof info.description === 'string' ? info.description : (info.description?.content || ''),
            totalEndpoints
        };
    }

    // ================== PRIVATE HELPERS ================== //

    static _parseItems = (items, collectionName, folderPath = '') => {
        const requests = [];

        for (const item of items) {
            if (item.request) {
                const parsed = this._parseRequest(item, collectionName, folderPath);
                if (parsed) requests.push(parsed);
            }

            if (item.item && Array.isArray(item.item)) {
                const currentPath = folderPath ? `${folderPath}/${item.name}` : item.name;
                requests.push(...this._parseItems(item.item, collectionName, currentPath));
            }
        }

        return requests;
    }

    static _parseRequest = (item, collectionName, folderPath) => {
        try {
            const req = item.request;
            const headers = {};
            const params = {};

            // Extract Headers
            if (Array.isArray(req.header)) {
                req.header.forEach(h => {
                    if (!h.disabled) headers[h.key] = h.value;
                });
            }

            // Extract Query Params
            if (req.url?.query && Array.isArray(req.url.query)) {
                req.url.query.forEach(p => {
                    if (!p.disabled) params[p.key] = p.value;
                });
            }

            // Extract Path Variables
            if (req.url?.variable && Array.isArray(req.url.variable)) {
                req.url.variable.forEach(v => {
                    params[v.key] = v.value || '';
                });
            }

            // Extract Body
            let body = null;
            let bodyFormat = null;
            if (req.body && !req.body.disabled) {
                bodyFormat = req.body.mode;
                switch (req.body.mode) {
                    case 'raw':
                        body = req.body.raw;
                        if (req.body.options?.raw?.language === 'json') bodyFormat = 'json';
                        break;
                    case 'urlencoded':
                        body = req.body.urlencoded;
                        break;
                    case 'formdata':
                        body = req.body.formdata;
                        break;
                    case 'graphql':
                        body = req.body.graphql;
                        break;
                }
            }

            const fullUrl = typeof req.url === 'string' ? req.url : (req.url?.raw || '');

            const requestData = {
                source: 'postman',
                name: item.name || 'Unnamed Request',
                method: (req.method || 'GET').toUpperCase(),
                url: fullUrl,
                headers,
                params,
                body,
                body_format: bodyFormat,
                folderName: folderPath || null,
                collectionName,
                description: typeof req.description === 'string' ? req.description : (req.description?.content || null),
                postmanId: item._postman_id || item.id || null
            };

            // Build Raw HTTP
            requestData.rawHttp = this._buildRaw(requestData);

            return requestData;
        } catch (error) {
            console.error(`Error parsing Postman request ${item.name}:`, error);
            return null;
        }
    }

    static _buildRaw = (req) => {
        let raw = `${req.method} ${req.url} HTTP/1.1\n`;

        Object.entries(req.headers).forEach(([k, v]) => {
            raw += `${k}: ${v}\n`;
        });

        if (req.body) {
            raw += '\n';
            if (typeof req.body === 'string') {
                raw += req.body;
            } else if (Array.isArray(req.body)) {
                // urlencoded or formdata
                raw += req.body
                    .filter(p => !p.disabled)
                    .map(p => `${p.key}=${p.value}`)
                    .join('&');
            } else {
                raw += JSON.stringify(req.body, null, 2);
            }
        }

        return raw;
    }
}
