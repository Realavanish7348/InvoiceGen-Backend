import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { badRequest } from "../../utils/AppError.js";
import { env } from "../../config/env.js";
import { aiInvoiceDraftSchema, aiInsightsSchema } from "./ai.schema.js";
import * as aiService from "./ai.service.js";

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

function optionalObjectId(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (!OBJECT_ID_RE.test(trimmed)) {
    throw badRequest("Invalid clientId", "VALIDATION_ERROR", {
      clientId: ["Must be a valid ObjectId"],
    });
  }
  return trimmed;
}

const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?._id ? String(req.user._id) : "anon";
    const companyId = req.companyId ?? "none";
    return `ai:${companyId}:${userId}`;
  },
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many AI requests. Try again shortly.",
    },
  },
});

const RECEIPT_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

const AUDIO_MIME = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "video/webm",
]);

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES },
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_AUDIO_UPLOAD_BYTES },
});

function uploadReceiptMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  memoryUpload.single("receipt")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return next(badRequest(message, "UPLOAD_ERROR"));
    }
    return next();
  });
}

function uploadAudioMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  audioUpload.single("audio")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return next(badRequest(message, "UPLOAD_ERROR"));
    }
    return next();
  });
}

async function draftInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await aiService.generateInvoiceDraft({
      companyId: req.companyId!,
      prompt: req.body.prompt,
      clientId: req.body.clientId,
    });
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

async function voiceInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw badRequest("Audio file is required", "FILE_REQUIRED");
    }
    if (!AUDIO_MIME.has(req.file.mimetype)) {
      throw badRequest(
        "Unsupported audio type. Use webm, wav, mp3, m4a, or ogg.",
        "UPLOAD_ERROR",
      );
    }
    const clientId = optionalObjectId(req.body.clientId);

    const result = await aiService.generateInvoiceDraftFromVoice({
      companyId: req.companyId!,
      buffer: req.file.buffer,
      filename: req.file.originalname || "audio.webm",
      mimeType: req.file.mimetype,
      clientId,
    });
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

async function scanReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw badRequest("Receipt file is required", "FILE_REQUIRED");
    }
    if (!RECEIPT_MIME.has(req.file.mimetype)) {
      throw badRequest(
        "Unsupported file type. Use PNG, JPEG, WEBP, or PDF.",
        "UPLOAD_ERROR",
      );
    }
    const result = await aiService.scanExpenseReceipt({
      companyId: req.companyId!,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname || "receipt",
    });
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

async function insights(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await aiService.generateFinancialInsights({
      companyId: req.companyId!,
      from: req.body.from,
      to: req.body.to,
      question: req.body.question,
    });
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

export const aiRouter = Router();
aiRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId, aiLimiter);

aiRouter.post(
  "/invoices/draft",
  validate({ body: aiInvoiceDraftSchema }),
  draftInvoice,
);
aiRouter.post("/invoices/voice", uploadAudioMiddleware, voiceInvoice);
aiRouter.post("/expenses/scan", uploadReceiptMiddleware, scanReceipt);
aiRouter.post(
  "/insights",
  validate({ body: aiInsightsSchema }),
  insights,
);
