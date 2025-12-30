import winston from "winston";

const { combine, timestamp, json, errors } = winston.format;

export const logger = winston.createLogger({
  level: "info",

  format: combine(
    errors({ stack: true }),
    timestamp(),
    json()
  ),

  defaultMeta: {
    service: "was-service",

    // 🔥 FILTERABLE IN SIGNOZ
    host: {
      name: process.env.HOST_NAME,
    },
    deployment: {
      environment: "production", // cloud | onprem
    },
  },

  transports: [
    new winston.transports.Console(), // WinstonInstrumentation hooks here
  ],
});
