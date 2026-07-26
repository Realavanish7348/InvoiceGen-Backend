import path from "node:path";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { env } from "./config/env.js";
import { isDbReady } from "./config/db.js";
import { requestId } from "./middleware/requestId.js";
import { sanitizeMongo } from "./middleware/sanitizeMongo.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes.js";
import { sendSuccess } from "./utils/apiResponse.js";
import * as paymentService from "./modules/payments/payment.service.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.get("/", (_req, res) => {
    return sendSuccess(res, {
      name: "InvoiceGen API",
      version: "v1",
      health: "/health",
      ready: "/ready",
      apiBase: "/api/v1",
    });
  });

  app.get("/health", (_req, res) => {
    return sendSuccess(res, { status: "ok" });
  });

  app.get("/ready", (_req, res) => {
    if (!isDbReady()) {
      return res.status(503).json({
        success: false,
        error: { code: "NOT_READY", message: "Database not ready" },
      });
    }
    return sendSuccess(res, { status: "ready" });
  });

  app.use(requestId);
  // cross-origin: Next.js (and other SPA origins) load /uploads via <img src>.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  // Stripe webhook needs the raw body for signature verification — mount before JSON parser.
  app.post(
    "/api/v1/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res, next) => {
      try {
        const signature = req.headers["stripe-signature"];
        const result = await paymentService.handleStripeWebhook(
          req.body as Buffer,
          typeof signature === "string" ? signature : undefined,
        );
        return sendSuccess(res, result);
      } catch (err) {
        return next(err);
      }
    },
  );

  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: true, limit: "10kb" }));
  app.use(cookieParser());
  app.use(sanitizeMongo);

  if (env.NODE_ENV === "development") {
    app.use(morgan("dev"));
  }

  const globalLimiter = rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests",
      },
    },
  });
  app.use("/api", globalLimiter);

  app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)),
  );

  app.use("/api/v1", apiRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  app.use(errorHandler);

  return app;
}
