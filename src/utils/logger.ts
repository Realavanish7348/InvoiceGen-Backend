import winston from "winston";
import { env } from "../config/env.js";

const SENSITIVE = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "smtp_pass",
  "encryption_key",
];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE.some((s) => k.toLowerCase().includes(s))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
      const safeMeta = redact(meta);
      const metaStr =
        safeMeta && Object.keys(safeMeta as object).length
          ? ` ${JSON.stringify(safeMeta)}`
          : "";
      return `${String(timestamp)} [${level}] ${String(stack ?? message)}${metaStr}`;
    }),
  ),
  transports: [new winston.transports.Console()],
  silent: env.NODE_ENV === "test",
});
