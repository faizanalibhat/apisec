import cron from "node-cron";
import  "../db/mongoose.js";
import Scan from "../models/scan.model.js";
import TransformedRequest from "../models/transformedRequest.model.js";


cron.schedule("*/1 * * * *", async () => {
  console.log(`[CRON] Checking for completed scans at ${new Date().toISOString()}`);

  try {
    // Step 1: Get all scanIds that still have pending transformed requests
    const scansWithPending = await TransformedRequest.distinct("scanId", {
      state: "pending",
    });

    // Step 2: Update all scans that are *not* in that list and are not already complete
    const result = await Scan.updateMany(
      {
        _id: { $nin: scansWithPending },
        status: { $ne: "complete" },
      },
      { $set: { status: "complete", completedAt: new Date() } }
    );

    console.log(
      `[CRON] Updated ${result.modifiedCount} scans to "complete".`
    );
  } catch (err) {
    console.error("[CRON] Error checking scan completion:", err);
  }
});
