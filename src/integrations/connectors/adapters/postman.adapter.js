import axios from "axios";
import { PostmanParser } from "../../parsers/all/postman.parser.js";

const postmanApiClient = axios.create({
    baseURL: "https://api.getpostman.com",
    timeout: 30000,
    validateStatus: () => true
});

export class PostmanAdapter {

    static getRequests = async (integration) => {
        const { api_key } = integration.config;

        const workspaces = await this._fetchWorkspaces(api_key);

        const allRequests = [];

        for (const workspace of workspaces) {
            const collections = await this._fetchCollections(api_key, workspace.id);

            for (const col of collections) {
                const detail = await this._fetchCollectionDetail(api_key, col.uid);
                if (detail) {
                    const requests = await PostmanParser.parseRequests(detail, col.uid);

                    console.log("[+] REQUEST FOUND : ", requests[0]?.method, requests[0]?.url);

                    allRequests.push(...requests);
                }
            }
        }

        return allRequests;
    };

    static getEnvironments = async (integration) => {
        const { api_key } = integration.config;

        const workspaces = await this._fetchWorkspaces(api_key);

        const allEnvironments = [];

        for (const workspace of workspaces) {
            const environments = await this._fetchEnvironments(api_key, workspace.id);

            for (const env of environments) {
                const detail = await this._fetchEnvironmentDetail(api_key, env.uid);
                if (detail) {
                    const parsedEnv = await PostmanParser.parseEnvironments(detail);

                    console.log("[+] ENVIRONMENT FOUND : ", parsedEnv?.name);

                    if (parsedEnv) allEnvironments.push(parsedEnv);
                }
            }
        }

        return allEnvironments;
    };

    static getCollections = async (integration) => {
        const { api_key } = integration.config;

        const workspaces = await this._fetchWorkspaces(api_key);

        const allCollectionsInfo = [];

        for (const workspace of workspaces) {
            const collections = await this._fetchCollections(api_key, workspace.id);

            for (const col of collections) {
                const detail = await this._fetchCollectionDetail(api_key, col.uid);
                if (detail) {
                    const info = await PostmanParser.parseCollections(detail, col.uid);

                    console.log("[+] COLLECTION FOUND : ", info?.name);

                    allCollectionsInfo.push(info);
                }
            }
        }

        return allCollectionsInfo;
    };


    // ============ HELPERS =============================== //

    static _fetchWorkspaces = async (apiKey) => {
        return this._makeRequest(apiKey, "/workspaces", "workspaces");
    };

    static _fetchCollections = async (apiKey, workspaceId) => {
        return this._makeRequest(apiKey, `/collections?workspace=${workspaceId}`, "collections");
    };

    static _fetchCollectionDetail = async (apiKey, collectionId) => {
        return this._makeRequest(apiKey, `/collections/${collectionId}`, "collection");
    };

    static _fetchEnvironments = async (apiKey, workspaceId) => {
        return this._makeRequest(apiKey, `/environments?workspace=${workspaceId}`, "environments");
    };

    static _fetchEnvironmentDetail = async (apiKey, environmentId) => {
        return this._makeRequest(apiKey, `/environments/${environmentId}`, "environment");
    };

    static _makeRequest = async (apiKey, url, dataKey, maxRetries = 3) => {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                const response = await postmanApiClient.get(url, {
                    headers: { 'X-Api-Key': apiKey }
                });

                if (response.status === 200) {
                    return response.data?.[dataKey];
                }

                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers['retry-after']) || 2;
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    attempt++;
                    continue;
                }

                throw new Error(`Postman API error: ${response.status} ${response.data?.error?.message || ''}`);
            } catch (error) {
                attempt++;
                if (attempt >= maxRetries) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
    };
}
