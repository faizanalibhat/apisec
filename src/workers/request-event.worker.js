import { mqbroker } from "../services/rabbitmq.service.js";
import { ScanService } from "../services/scan.service.js";
import "../db/mongoose.js";

const scanService = new ScanService();

/**
 * Handles the 'request.created' event to trigger a project-based scan.
 * @param {object} payload The message payload from RabbitMQ.
 * @param {object} msg The original message object from RabbitMQ.
 * @param {object} channel The RabbitMQ channel.
 */
async function requestCreatedHandler(payload, msg, channel) {
    const { projectId, orgId, rawRequestId } = payload;

    try {
        console.log(`[+] Event received: request.created for project ${projectId}`);

        if (!projectId || !orgId) {
            console.error('[!] Invalid payload received. Missing projectId or orgId.', payload);
            // Acknowledge the message to prevent it from being re-queued
            return channel.ack(msg);
        }

        // Prepare scan data for a project-based scan
        const scanData = {
            name: `Auto-scan for new request in project ${projectId}`,
            description: `Automatically triggered scan for new request ${rawRequestId}`,
            projectIds: [projectId],
            orgId,
            scope: [], // Or determine scope from project settings if available
            authContext: 'system:event'
        };

        console.log(`[+] Creating project-based scan for project: ${projectId}`);
        const scan = await scanService.createScan(scanData);
        console.log(`[+] Successfully created scan ${scan._id} for project ${projectId}`);

    } catch (error) {
        console.error(`[!] Error processing request.created event for project ${projectId}:`, error);
        // In a production scenario, you might want to nack(msg, false, false) to discard
        // or implement a dead-letter queue for failed messages.
    } finally {
        // Acknowledge the message to remove it from the queue
        channel.ack(msg);
    }
}

/**
 * Initializes the worker to consume request-related events.
 */
async function requestEventWorker() {
    console.log('[+] REQUEST EVENT WORKER IS UP...');

    // Consume events where a new request is created in a project
    // await mqbroker.consume(
    //     "apisec",
    //     "apisec.request.created",
    //     requestCreatedHandler,
    //     'requestCreatedEventsQueue'
    // );
}

// Start the worker
requestEventWorker();
