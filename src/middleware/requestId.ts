import type { RequestHandler } from "express";
import { randomToken } from "../utils/tokenCompare.js";

export const requestId: RequestHandler = (req, res, next) => {
  const id = (req.headers["x-request-id"] as string | undefined) || randomToken(8);
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};
