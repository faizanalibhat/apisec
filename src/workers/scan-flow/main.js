import { mqbroker } from "../../services/rabbitmq.service.js";
import { transformation } from "./transformation.js";
import { requestReplay } from "./request-replay.js";
import Vulnerability from "../../models/vulnerability.model.js";
import Scan from "../../models/scan.model.js";


async function handleRequestScan(payload, msg, channel) {
    const { project, scan, request } = payload;

    try {
        const transformed_request_ids = await transformation({ request, project, scan });

        // replay requests & match responses & return vulns to be created.
        const vulns = await requestReplay({ requestIds: transformed_request_ids, project, scan });

        console.log("[+] TOTAL VULNERABILITIES FOUND : ", vulns.length);

        for (let vuln of vulns) {

            const query = {
                orgId: vuln.orgId,
                scanId: vuln.scanId,
                'ruleSnapshot._id': vuln.ruleSnapshot._id,
                'requestSnapshot._id': vuln.requestSnapshot._id,
                'transformedRequestSnapshot._id': vuln.transformedRequestSnapshot._id
            };

            // upsert: true -> create if not exists, update otherwise
            const result = await Vulnerability.findOneAndUpdate(
                query,
                { $set: vuln },
                { upsert: true, new: true, setDefaultsOnInsert: true, rawResult: true }
            );
        }
    }
    catch(err) {
        console.log(err);
    }
    finally {
        channel.ack(msg);
    }
}

export async function handleScanFlow() {
    await mqbroker.consume("apisec", "apisec.scanflow.initiate", handleRequestScan, "scanFlowQueue", { prefetchCount: 1 });
}