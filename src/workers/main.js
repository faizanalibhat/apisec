import { syncRulesFromGithub } from "./sync-rules.worker.js";
import { scanWorker } from "./scan.worker.js";
import { requestEventWorker } from "./request-event.worker.js";
import { vmEventWorker } from "./vm-event.worker.js";
import { crawler } from "./crawler/main.js";
import { connectDB } from "../db/connect-db.js";


connectDB();

vmEventWorker();
requestEventWorker();
scanWorker();
syncRulesFromGithub();
crawler();