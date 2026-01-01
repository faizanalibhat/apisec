// import parsers
import { OpenApiParser } from "./all/openapi.parser.js";
import { PostmanParser } from "./all/postman.parser.js";

// parser registery
const PARSER_REGISTERY = {
    postman: PostmanParser,
    openapi: OpenApiParser
}


export class Parser {

    static parseRequests = async (type, { spec }) => {
        const parser = PARSER_REGISTERY[type];

        if (!parser) throw new Error(`Parser not found for type: ${type}`);

        return parser.parseRequests(spec);
    }

    static parseEnvironments = async (type, { spec }) => {
        const parser = PARSER_REGISTERY[type];

        if (!parser) throw new Error(`Parser not found for type: ${type}`);

        return parser.parseEnvironments(spec);
    }

    static parseCollections = async (type, { spec }) => {
        const parser = PARSER_REGISTERY[type];

        if (!parser) throw new Error(`Parser not found for type: ${type}`);

        return parser.parseCollections(spec);
    }

}