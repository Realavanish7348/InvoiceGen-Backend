import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/AppError.js";

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const fields: Record<string, string[]> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = issue.path.join(".") || "body";
          fields[key] = [...(fields[key] ?? []), issue.message];
        }
      } else {
        req.body = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = issue.path.join(".") || "query";
          fields[key] = [...(fields[key] ?? []), issue.message];
        }
      } else {
        Object.assign(req.query, result.data);
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = issue.path.join(".") || "params";
          fields[key] = [...(fields[key] ?? []), issue.message];
        }
      } else {
        Object.assign(req.params, result.data);
      }
    }

    if (Object.keys(fields).length > 0) {
      return next(
        new AppError(400, "VALIDATION_ERROR", "Validation failed", fields),
      );
    }

    return next();
  };
}
