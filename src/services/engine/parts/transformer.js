import url from "url";

// ============================================================================
// TRANSFORMER REGISTRY
// ============================================================================

class TransformerRegistry {
    constructor() {
        this.transformers = [];
    }

    register(transformer) {
        if (!transformer.key || !transformer.transform) {
            throw new Error('Transformer must have: key and transform() method');
        }
        this.transformers.push(transformer);
        return this;
    }

    getTransformers() {
        return this.transformers;
    }

    clear() {
        this.transformers = [];
    }
}

// ============================================================================
// BUILT-IN TRANSFORMERS
// ============================================================================

const HeaderRemovalTransformer = {
    key: 'header_removal',
    transform(context) {
        const remove = context.rule.transform?.headers?.remove || [];
        if (remove.length === 0) return;

        remove.forEach(key => {
            delete context.headers[key];
        });
    }
};

const HeaderReplaceAllValuesTransformer = {
    key: 'header_replace_all_values',
    transform(context) {
        const value = context.rule.transform?.headers?.replace_all_values;
        if (!value) return;

        Object.keys(context.headers).forEach(k => {
            context.headers[k] = value;
        });
    }
};

const HeaderAddTransformer = {
    key: 'header_add',
    transform(context) {
        const toAdd = context.rule.transform?.headers?.add || {};
        Object.entries(toAdd).forEach(([key, value]) => {
            context.headers[key] = value;
        });
    }
};

const CookieRemovalTransformer = {
    key: 'cookie_removal',
    transform(context) {
        const remove = context.rule.transform?.cookies?.remove || [];
        if (remove.length === 0) return;

        remove.forEach(k => delete context.cookies[k]);
        context.rebuildCookieHeader = true;
    }
};

const CookieAddTransformer = {
    key: 'cookie_add',
    transform(context) {
        const toAdd = context.rule.transform?.cookies?.add || {};
        Object.entries(toAdd).forEach(([k, v]) => {
            context.cookies[k] = v;
        });
        context.rebuildCookieHeader = true;
    }
};

const HostOverrideTransformer = {
    key: 'override_host',
    transform(context) {
        const host = context.rule.transform?.override_host;
        if (!host) return;
        context.baseUrl.host = host;
    }
};

const ProtocolOverrideTransformer = {
    key: 'override_protocol',
    transform(context) {
        const protocol = context.rule.transform?.override_protocol;
        if (!protocol) return;
        context.baseUrl.protocol = protocol;
    }
};

const PortOverrideTransformer = {
    key: 'override_port',
    transform(context) {
        const port = context.rule.transform?.override_port;
        if (!port) return;
        context.baseUrl.port = port;
    }
};

const ReplaceParamValueTransformer = {
    key: 'replace_param_value',
    transform(context) {
        const replacements = context.rule.transform?.replace_param_value || {};
        Object.entries(replacements).forEach(([key, value]) => {
            if (context.params.has(key)) {
                context.params.set(key, value);
            }
        });
    }
};

const ReplaceAllParamValuesTransformer = {
    key: 'replace_all_param_values',
    transform(context) {
        const value = context.rule.transform?.replace_all_param_values;
        if (!value) return;

        for (const key of context.params.keys()) {
            context.params.set(key, value);
        }
    }
};

const ReplaceParamsOneByOneTransformer = {
    key: 'replace_params_one_by_one',
    transform(context) {
        const value = context.rule.transform?.replace_params_one_by_one;
        if (!value) return;

        context.variantQueue = context.variantQueue || [];
        const paramKeys = Array.from(context.params.keys());

        for (const paramKey of paramKeys) {
            const variantParams = new URLSearchParams(context.params);
            variantParams.set(paramKey, value);

            context.variantQueue.push({
                params: variantParams,
                metadata: { replacedParam: paramKey, value }
            });
        }
    }
};

const AddQueryParamsTransformer = {
    key: 'add_query_params',
    transform(context) {
        const toAdd = context.rule.transform?.add_query_params || {};
        Object.entries(toAdd).forEach(([key, value]) => {
            context.params.set(key, value);
        });
    }
};

const RepeatWithMethodsTransformer = {
    key: 'repeat_with_methods',
    transform(context) {
        const methods = context.rule.transform?.repeat_with_methods;
        if (!methods || methods.length === 0) return;

        context.methodVariants = methods;
    }
};

// ============================================================================
// BODY TRANSFORMERS
// ============================================================================

const ReplaceBodyParamValueTransformer = {
    key: 'replace_body_param_value',
    transform(context) {
        const replacements = context.rule.transform?.replace_body_param_value || {};
        if (Object.keys(replacements).length === 0) return;
        if (!context.bodyJson) return;

        Object.entries(replacements).forEach(([key, value]) => {
            if (key in context.bodyJson) {
                context.bodyJson[key] = value;
            }
        });

        context.rebuildBody = true;
    }
};

const AddBodyParamTransformer = {
    key: 'add_body_param',
    transform(context) {
        const toAdd = context.rule.transform?.add_body_param || {};
        if (Object.keys(toAdd).length === 0) return;

        // Initialize body as empty object if not present
        if (!context.bodyJson) {
            context.bodyJson = {};
        }

        Object.entries(toAdd).forEach(([key, value]) => {
            context.bodyJson[key] = value;
        });

        context.rebuildBody = true;
    }
};

const ReplaceAllBodyValuesTransformer = {
    key: 'replace_all_body_values',
    transform(context) {
        const value = context.rule.transform?.replace_all_body_values;
        if (!value) return;
        if (!context.bodyJson) return;

        Object.keys(context.bodyJson).forEach(key => {
            context.bodyJson[key] = value;
        });

        context.rebuildBody = true;
    }
};

const ReplaceBodyParamsOneByOneTransformer = {
    key: 'replace_body_params_one_by_one',
    transform(context) {
        const value = context.rule.transform?.replace_body_params_one_by_one;
        if (!value) return;
        if (!context.bodyJson || Object.keys(context.bodyJson).length === 0) return;

        context.bodyVariantQueue = context.bodyVariantQueue || [];
        const bodyKeys = Object.keys(context.bodyJson);

        for (const bodyKey of bodyKeys) {
            const variantBody = { ...context.bodyJson };
            variantBody[bodyKey] = value;

            context.bodyVariantQueue.push({
                body: variantBody,
                metadata: { replacedBodyParam: bodyKey, value }
            });
        }
    }
};

const RemoveBodyParamTransformer = {
    key: 'remove_body_param',
    transform(context) {
        const remove = context.rule.transform?.remove_body_param || [];
        if (remove.length === 0) return;
        if (!context.bodyJson) return;

        remove.forEach(key => {
            delete context.bodyJson[key];
        });

        context.rebuildBody = true;
    }
};

// ============================================================================
// MAIN TRANSFORMER FACTORY
// ============================================================================

export const createTransformer = () => {
    const registry = new TransformerRegistry();

    // Register built-in transformers
    registry.register(HeaderRemovalTransformer);
    registry.register(HeaderReplaceAllValuesTransformer);
    registry.register(HeaderAddTransformer);
    registry.register(CookieRemovalTransformer);
    registry.register(CookieAddTransformer);
    registry.register(HostOverrideTransformer);
    registry.register(ProtocolOverrideTransformer);
    registry.register(PortOverrideTransformer);
    registry.register(ReplaceParamValueTransformer);
    registry.register(ReplaceAllParamValuesTransformer);
    registry.register(ReplaceParamsOneByOneTransformer);
    registry.register(AddQueryParamsTransformer);
    registry.register(RepeatWithMethodsTransformer);

    // Register body transformers
    registry.register(ReplaceBodyParamValueTransformer);
    registry.register(AddBodyParamTransformer);
    registry.register(ReplaceAllBodyValuesTransformer);
    registry.register(ReplaceBodyParamsOneByOneTransformer);
    registry.register(RemoveBodyParamTransformer);

    return {
        /**
         * Add a custom transformer
         * @param {Object} transformer - { key, transform(context) }
         */
        addTransformer(transformer) {
            registry.register(transformer);
            return this;
        },

        /**
         * Transform a request based on rules
         * @param {Object} request - { url, method, headers, ... }
         * @param {Object} rule - { transform: { ... } }
         * @returns {Array} Array of transformed request variants
         */
        transform({ request, rule }) {
            const original = { ...request };
            const baseUrl = new URL(original.url);
            const params = baseUrl.searchParams;
            const headers = { ...original.headers };

            // Parse cookies from Cookie header
            const cookieHeader = headers['Cookie'] || '';
            const cookies = parseCookies(cookieHeader);

            // Parse body if JSON
            let bodyJson = null;
            if (original.body && isJsonContentType(headers['Content-Type'])) {
                try {
                    bodyJson = typeof original.body === 'string'
                        ? JSON.parse(original.body)
                        : original.body;
                } catch (e) {
                    // Invalid JSON, skip body transformations
                    bodyJson = null;
                }
            }

            // Build transformation context
            const context = {
                original,
                baseUrl,
                params,
                headers,
                cookies,
                bodyJson,
                rule,
                rebuildCookieHeader: false,
                rebuildBody: false,
                variantQueue: [],
                bodyVariantQueue: [],
                methodVariants: [original.method],
            };

            // Run all transformers
            const transformers = registry.getTransformers();
            for (const transformer of transformers) {
                transformer.transform(context);
            }

            // Rebuild Cookie header if modified
            if (context.rebuildCookieHeader) {
                rebuildCookieHeader(headers, context.cookies);
            }

            // Rebuild body if modified
            let body = original.body;
            if (context.rebuildBody && context.bodyJson) {
                body = JSON.stringify(context.bodyJson);
                // Update Content-Length header
                headers['Content-Length'] = Buffer.byteLength(body, 'utf8').toString();
            }

            // Build base transformed request
            const baseTransformed = {
                ...original,
                method: original.method,
                headers,
                body,
                url: baseUrl.toString(),
            };

            // Generate variants
            let variants = [];

            // Priority 1: Body parameter one-by-one replacements
            if (context.bodyVariantQueue.length > 0) {
                variants = context.bodyVariantQueue.map(variant => {
                    const variantBody = JSON.stringify(variant.body);
                    const variantHeaders = { ...headers };
                    variantHeaders['Content-Length'] = Buffer.byteLength(variantBody, 'utf8').toString();

                    return {
                        ...baseTransformed,
                        body: variantBody,
                        headers: variantHeaders,
                        _metadata: variant.metadata,
                    };
                });
            }
            // Priority 2: Query parameter one-by-one replacements
            else if (context.variantQueue.length > 0) {
                variants = context.variantQueue.map(variant => {
                    const url = new URL(baseUrl.toString());
                    url.search = variant.params.toString();
                    return {
                        ...baseTransformed,
                        url: url.toString(),
                        _metadata: variant.metadata,
                    };
                });
            }
            // Priority 3: Method variants
            else {
                variants = context.methodVariants.map(method => ({
                    ...baseTransformed,
                    method,
                }));
            }

            return variants;
        },
    };
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const parseCookies = (cookieHeader) => {
    if (!cookieHeader) return {};

    return Object.fromEntries(
        cookieHeader
            .split(';')
            .map(c => {
                const [k, v] = c.trim().split('=');
                return [k, v];
            })
            .filter(([k]) => k)
    );
};

const rebuildCookieHeader = (headers, cookies) => {
    if (Object.keys(cookies).length > 0) {
        headers['Cookie'] = Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    } else {
        delete headers['Cookie'];
    }
};

const isJsonContentType = (contentType) => {
    if (!contentType) return false;
    return contentType.toLowerCase().includes('application/json');
};

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const transformer = createTransformer();