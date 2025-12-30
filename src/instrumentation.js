import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { logs } from "@opentelemetry/api-logs";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";

const BASE_ENDPIONT = process.env.OTEL_EXPORT_URL;

// Create OTLP exporters
const traceExporter = new OTLPTraceExporter({
  url: BASE_ENDPIONT + '/v1/traces'
});

const logExporter = new OTLPLogExporter({
  url: BASE_ENDPIONT + '/v1/logs'
});

// Create resource with service name
const resource = new Resource({
  [ATTR_SERVICE_NAME]: "was-service",
});

// Initialize Logger Provider
const loggerProvider = new LoggerProvider({
  resource,
});
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));

// Register the logger provider globally
logs.setGlobalLoggerProvider(loggerProvider);

// Initialize Node SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Automatically instruments Express, HTTP, and other Node.js libraries
      "@opentelemetry/instrumentation-fs": {
        enabled: false, // Disable file system instrumentation if not needed
      },
    }),
    // Winston instrumentation for log correlation with traces
    new WinstonInstrumentation({
      logHook: (span, record) => {
        record["resource.service.name"] = "was-service";
      },
    }),
  ],
});

// Start the SDK
try {
  sdk.start();
  console.log("OpenTelemetry instrumentation initialized successfully");
} catch (error) {
  console.error("Error initializing OpenTelemetry:", error);
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("OpenTelemetry SDK shut down successfully"))
    .catch((error) =>
      console.error("Error shutting down OpenTelemetry:", error)
    )
    .finally(() => process.exit(0));
});

// export { loggerProvider };