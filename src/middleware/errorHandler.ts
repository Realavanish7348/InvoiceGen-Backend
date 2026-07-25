import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
  }

  if (err?.name === "MulterError") {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err.message,
      },
    });
  }

  // body-parser / express.json malformed JSON
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Malformed JSON body",
      },
    });
  }

  // body-parser payload limit (express.json limit: 10kb)
  if (
    err?.type === "entity.too.large" ||
    err?.status === 413 ||
    err?.statusCode === 413
  ) {
    return res.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds size limit",
      },
    });
  }

  logger.error("Unhandled error", {
    message: err?.message,
    stack: env.NODE_ENV === "production" ? undefined : err?.stack,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
