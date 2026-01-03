import { mqbroker } from "../../services/rabbitmq.service.js";
import Scan from "../../models/scan.model.js";
import { getProcessedCollectionRequests } from "./collection.scanner.js";

async function collectionScanOnProject(payload, msg, channel) {
  const { project, scan } = payload;

  try {
    const requests = await getProcessedCollectionRequests({ project });

    // send requests for scan flow
    for (let request of requests) {
      await mqbroker.publish("apisec", "apisec.scanflow.initiate", {
        project,
        scan,
        request,
      });
    }

    await Scan.findOneAndUpdate(
      { _id: scan._id },
      { $set: { status: "completed" } },
    );
  } catch (err) {
    console.log(err);
    await Scan.findOneAndUpdate(
      { _id: scan._id },
      { $set: { status: "failed" } },
    );
  } finally {
    channel.ack(msg);
  }
}

export async function handleCollectionScan() {
  await mqbroker.consume(
    "apisec",
    "apisec.scanflow.collection",
    collectionScanOnProject,
    "collectionScanQueue",
    { prefetchCount: 1 },
  );
}
