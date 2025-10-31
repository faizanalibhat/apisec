import { mqbroker } from "../services/rabbitmq.service.js";
import { VulnerabilityService } from "../services/vulnerability.service.js";
import "../db/mongoose.js";

const vulnerabilityService = new VulnerabilityService();

async function vulnerabilityUpdatedHandler(payload, msg, channel) {
  try {
    const { data: vuln } = payload;
    if (!vuln || !vuln.universalVulnId) {
      console.error('[!] Invalid payload received. Missing universalVulnId.', payload);
      return channel.ack(msg);
    }

    console.log(`[+] Received vulnerability update for ${vuln.universalVulnId}`);

    await vulnerabilityService.updateVulnerabilityFromVM(vuln);

  } catch (error) {
    console.error(`[!] Error processing vm.vuln.update event:`, error.message);
  } finally {
    channel.ack(msg);
  }
}

/**
 * Initializes the worker to consume vulnerability update events from VM.
 */
async function vmEventWorker() {
    console.log('[+] VM EVENT WORKER IS UP...');
    await mqbroker.consume("vm", "vm.vuln.update", vulnerabilityUpdatedHandler, 'vmVulnUpdateQueue');
}

// Start the worker
vmEventWorker();
