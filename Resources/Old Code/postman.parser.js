
/**
 * Extracts and formats query parameters from a Postman request.
 * Filters out disabled parameters.
 * @param {Array} queryArray - The request.url.query array from Postman.
 * @returns {Array<{key: string, value: string}>} A clean array of query parameters.
 */
function extractQueryParams(queryArray) {
    if (!Array.isArray(queryArray)) {
        return [];
    }

    return queryArray
        // .filter(param => !param.disabled) // Only include params that are enabled
        .map(param => ({
            key: param.key || '',
            value: param.value || ''
        }));
}


function extractHeaders(headers = []) {

    function getValue(h) {
        if (h.key?.toLowerCase() == "authorization") return "{{token}}";

        return h.value || '';
    }

    return headers.map(h => ({
        key: h.key || '',
        value: getValue(h),
        type: h.type || 'text'
    }));
}


function extractBody(bodyObj) {
    if (!bodyObj) {
        return null;
    }

    switch (bodyObj.mode) {
        case 'raw':
            return bodyObj.raw;
        case 'urlencoded':
            if (bodyObj.urlencoded) {
                return bodyObj.urlencoded.map(param => `${param.key}=${param.value}`).join('&');
            }
            return '';
        case 'formdata':
            if (bodyObj.formdata) {
                // For form-data, we'll represent it as key=value pairs for simplicity
                // In a real raw request, this would be multipart/form-data with boundaries
                return bodyObj.formdata.map(param => `${param.key}=${param.value}`).join('&');
            }
            return '';
        case 'file':
            // For file mode, you might want to indicate a file upload placeholder
            return '[File Content]';
        default:
            return null;
    }
}


function constructRawRequest(method, url, host, headers, body, params) {
    let raw = `${method} ${url}?${params?.length ? params?.reduce((f,c) => { return f + '&' + `${c.key}=${c.value}` }, '') : ''}\n`; // Include path and query parameters

    // Add Host header if not already present
    const hostHeaderExists = headers.some(header => header.key.toLowerCase() === 'host');
    if (!hostHeaderExists) {
        raw += `Host: ${host}\n`;
    }

    // Add other headers
    for (const header of headers) {
        // Ensure Host header from Postman is correctly formatted and not duplicated
        if (header.key.toLowerCase() === 'host' && !hostHeaderExists) {
            raw += `Host: ${header.value}\n`;
        } else if (header.key.toLowerCase() !== 'host') { // Avoid duplicating host if it was added manually
            raw += `${header.key}: ${header.value}\n`;
        }
    }

    // Add an extra newline to separate headers from body
    raw += '\n';

    // Add the body if it exists
    if (body) {
        raw += body;
    }

    return raw;
}



function parseEndpoint(endpoint) {
    // Split path and query manually
    const [endpointPath, queryString] = endpoint.split("?", 2);

    // Remove protocol + domain if present
    let pathname = endpointPath;
    if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
        pathname = pathname.split("/").slice(3).join("/");
        pathname = "/" + pathname; // ensure leading slash
    }

    // Extract query params without decoding
    const queryParams = queryString
        ? queryString.split("&").map(param => {
            const [key, value] = param.split("=");
            return { key, value };
        })
        : [];

    return {
        path: pathname,
        queryParams
    };
}


class PostmanParser {

    static _parseItems(items, parsed = []) {
        for (const item of items) {
            if (item.request) {
                const req = item.request;
                let url = req.url?.raw || '';
                let endpointOnly = parseEndpoint(url).path;
                const host = req.url?.host?.[0] || '';

                const extractedHeaders = extractHeaders(req.header);
                const extractedBody = extractBody(req.body);
                const extractedQueryParams = extractQueryParams(req.url?.query);

                parsed.push({
                    name: item.name || '',
                    method: req.method?.toUpperCase?.() || 'GET',
                    url: endpointOnly,
                    host: host,
                    headers: extractedHeaders,
                    body: extractedBody,
                    params: extractedQueryParams,
                    raw_request: constructRawRequest(req.method || "GET", url, host, extractedHeaders, extractedBody),
                });
            } else if (item.item) {
                this._parseItems(item.item, parsed); // Recursively parse nested items
            }
        }

        return parsed;
    }

    static async parseCollection(raw, context = {}) {
        const json = JSON.parse(raw);

        const info = json.info;

        let endpoints = this._parseItems(json.item || []);

        console.log("[+] INFO " , info);

        // append orgId
        endpoints = endpoints.map(endpoint => ({ ...endpoint, orgId: context.orgId, projectId: context.projectId, postman_reference: info._collection_link }));

        return endpoints;
    }
}


module.exports = { PostmanParser };