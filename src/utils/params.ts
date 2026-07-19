import type { Request } from "express";
import { badRequest } from "./AppError.js";

/** Express 5 types params as string | string[]; normalize to a single string. */
export function paramId(req: Request, name = "id"): string {
  const value = req.params[name];
  const id = Array.isArray(value) ? value[0] : value;
  if (!id || typeof id !== "string") {
    throw badRequest("Missing resource id");
  }
  return id;
}
