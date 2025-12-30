import { randomUUID } from "crypto";
import { context, trace } from "@opentelemetry/api";

export function traceContext(req, res, next) {
  // Ensure req.context always exists
  req.context = req.context || {};

  // Try to get trace_id from OpenTelemetry (preferred)
  const span = trace.getSpan(context.active());

  let traceId;

  if (span) {
    traceId = span.spanContext().traceId;
  } else {
    // Fallback: generate our own trace_id
    traceId = randomUUID();
  }

  // Attach to request context
  req.context.trace_id = traceId;

  // Also expose it for downstream systems
  req.headers["x-trace-id"] = traceId;
  res.setHeader("x-trace-id", traceId);

  next();
}
