import { mqbroker } from "../../services/rabbitmq.service.js";


async function handleRequestScan(payload, msg, channel) {
    try {
        console.log("[+] SCANNING THE REQUEST : ", payload.request);
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