import axios from 'axios';
import { OpenApiParser } from '../parsers/all/openapi.parser.js';

const swaggerApiClient = axios.create({
    timeout: 30000, // 30 seconds
    headers: {
        'Accept': 'application/json, application/yaml',
        'User-Agent': 'APISEC-Swagger-Client/1.0'
    },
    validateStatus: () => true
});


export class OpenApiAdapter {

    static isValidIntegration = async (integration) => {
        try {
            await this._validateUrl(integration);
            return true;
        } catch (error) {
            return false;
        }
    };

    static getRequests = async (integration) => {

        const { spec } = await this._fetchSwaggerSpec(integration);

        return OpenApiParser.parseRequests(spec);

    };

    static getEnvironments = async (integration) => {

        const { spec } = await this._fetchSwaggerSpec(integration);

        const parsedEnv = await OpenApiParser.parseEnvironments(spec);

        return [parsedEnv];

    };

    static getCollections = async (integration) => {

        const { spec } = await this._fetchSwaggerSpec(integration);

        return OpenApiParser.parseCollections(spec);

    };


    // ================== HELPERS ====================== //

    static _validateUrl = async (integration) => {

        const response = await swaggerApiClient.get(integration.url);

        if (response?.status != 200) {
            throw Error("Invalid URL");
        }

        return true;
    };

    static _fetchSwaggerSpec = async (integration) => {
        const { url } = integration.config;

        const response = await swaggerApiClient.get(url);

        if (response?.status != 200) {
            throw Error("Invalid URL");
        }

        let spec = response.data;

        if (typeof spec === 'string') {
            try {
                spec = JSON.parse(spec);
            } catch (e) {
                throw Error("Invalid JSON format in Swagger specification");
            }
        }

        const validation = this._validateSpec(spec);

        if (!validation.valid) {
            throw Error("Invalid Spec");
        }

        return { spec, version: validation.version, info: validation.info };
    };

    static _validateSpec = async (spec) => {

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
    };

    static _resolveReferences = async (spec) => {

        const resolved = JSON.parse(JSON.stringify(spec));

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
    };

}