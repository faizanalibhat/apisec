import { mqbroker } from "../../services/rabbitmq.service.js";


async function crawlerWorker(payload, msg, channel) {
    try {
        const { project, scan } = payload;

        
    }
    catch(err) {
        console.log(err);
    } 
    finally {
        channel.ack(msg);
    }
}



export async function main() {

    await mqbroker.consume("apisec", "apisec.project.scan.launched", crawlerWorker);
}