import fs from "fs/promises";
import { mqbroker } from "../../services/rabbitmq.service.js";
import { browserWorker } from "./browser-worker.js";


export async function crawler() {
    await mqbroker.consume("apisec", "apisec.project.scan.launched", browserWorker, "crawlingScansOnProject", { prefetchCount: 1 });
}