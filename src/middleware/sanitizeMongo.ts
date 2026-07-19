import type { RequestHandler } from "express";

/**
 * Express 5 makes `req.query` a getter-only property, so express-mongo-sanitize
 * crashes when it tries to reassign it. This middleware strips operator keys
 * in place without reassigning request bags.
 */
function stripKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) stripKeys(item);
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      continue;
    }
    stripKeys(obj[key]);
  }
}

export const sanitizeMongo: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    stripKeys(req.body);
  }
  if (req.params && typeof req.params === "object") {
    stripKeys(req.params);
  }
  if (req.query && typeof req.query === "object") {
    stripKeys(req.query);
  }
  next();
};
