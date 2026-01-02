import { mqbroker } from "../../services/rabbitmq.service.js";
import { APPLICATION_EXCHANGE_NAME ,INTEGRATION_EVENT_ROUTING_KEYS } from "../../config/constants.js";


// event handlers
import { handleInstallIntegration } from "./handlers/install.handler.js";
import { handleRefreshIntegration } from "./handlers/refresh.handler.js";


export async function integrationEventsWorker() {

    await mqbroker.consume(APPLICATION_EXCHANGE_NAME, INTEGRATION_EVENT_ROUTING_KEYS.INSTALL_INTEGRATION, handleInstallIntegration, "install_integration_events_queue");
    await mqbroker.consume(APPLICATION_EXCHANGE_NAME, INTEGRATION_EVENT_ROUTING_KEYS.REFRESH_INTEGRATION, handleRefreshIntegration, "refresh_integration_events_queue");
}