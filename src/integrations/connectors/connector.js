// import different adapters
import { PostmanAdapter } from "./adapters/postman.adapter.js";
import { OpenApiAdapter } from "./adapters/openapi.adapter.js";


// map adapters to their types
const ADAPTER_REGISTERY = {
    postman: PostmanAdapter,
    swagger: OpenApiAdapter
}


// very basic interface
export class Connector {

    static getRequests = async (type, { integration }) => {
        const adapter = ADAPTER_REGISTERY[type];

        if (!adapter) {
            throw new Error(`Adapter not found for type: ${type}`);
        }

        return adapter.getRequests(integration);
    }

    static getEnvironments = async (type, { integration }) => {
        const adapter = ADAPTER_REGISTERY[type];

        if (!adapter) {
            throw new Error(`Adapter not found for type: ${type}`);
        }

        return adapter.getEnvironments(integration);
    }

    static getCollections = async (type, { integration }) => {
        const adapter = ADAPTER_REGISTERY[type];

        if (!adapter) {
            throw new Error(`Adapter not found for type: ${type}`);
        }

        return adapter.getCollections(integration);
    }

}