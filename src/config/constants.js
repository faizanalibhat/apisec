export const APPLICATION_EXCHANGE_NAME = "apisec";

export const INTEGRATION_EVENT_ROUTING_KEYS = {
  GET_INTEGRATION: "apisec.integration.get",
  UPDATE_INTEGRATION: "apisec.integration.updated",
  DELETE_INTEGRATION: "apisec.integration.deleted",
  REFRESH_INTEGRATION: "apisec.integration.refreshed",
  INSTALL_INTEGRATION: "apisec.integration.installed",
};

export const RESOLVED_VULNERABILITY_STATES = [
  "Not Applicable",
  "Fixed In Staging",
  "Resolved",
  "False Positive",
];
