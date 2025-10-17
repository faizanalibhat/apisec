import { transformer } from "./parts/transformer.js";
import { matcher } from "./parts/matcher.js";
import { sendReport, sendRequest } from "./parts/sender.js";



export class EngineService {

    static async transform({ request, rule }) {

        const transformed_requests = transformer.transform({ request, rule });

        return transformed_requests;

    }

    static async sendRequest({ request }) {

        const sent = await sendRequest({ request });

        return sent;

    }


    static async sendReport({ report }) {
        const reported = await sendReport(report);

        return reported;
    }

    static async match({ response, rule }) {
        // Use the enhanced matcher that returns detailed results
        const matchResult = matcher.match({ response, rule });
        return matchResult;
    }
}