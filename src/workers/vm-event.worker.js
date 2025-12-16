import { mqbroker } from "../services/rabbitmq.service.js";
import { VulnerabilityService } from "../services/vulnerability.service.js";
import "../db/mongoose.js";

const vulnerabilityService = new VulnerabilityService();

async function vulnerabilityUpdatedHandler(payload, msg, channel) {
  try {
    const { vuln } = payload;

    console.log("[+] UPDATE EVENT RECIEVED : ", vuln.title, vuln.state);

    if (!vuln || !vuln.universalVulnId) {
      console.error('[!] Invalid payload received. Missing universalVulnId.', payload);
    }

    console.log(`[+] Received vulnerability update for ${vuln.universalVulnId}`);

    await vulnerabilityService.updateVulnerabilityFromVM(vuln);

    console.log("[+] STATE SYNCED ");

  } catch (error) {
    console.error(`[!] Error processing vm.vuln.update event:`, error.message);
  } finally {
    channel.ack(msg);
  }
}


export async function vmEventWorker() {
    console.log('[+] VM EVENT WORKER IS UP...');
    await mqbroker.consume("vm", "vm.vuln.update", vulnerabilityUpdatedHandler, 'vmVulnUpdateQueue');
}