import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { badRequest } from "../../utils/AppError.js";
import { env } from "../../config/env.js";
import { updateBusinessProfileSchema } from "./businessProfile.schema.js";
import * as businessProfileService from "./businessProfile.service.js";

const LOGO_SUBDIR = "logos";
const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR, LOGO_SUBDIR);
fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    const companyId = req.companyId ?? "unknown";
    cb(null, `${companyId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Unsupported file type. Use PNG, JPEG, WEBP or SVG."));
      return;
    }
    cb(null, true);
  },
});

function uploadLogoMiddleware(req: Request, res: Response, next: NextFunction) {
  upload.single("logo")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return next(badRequest(message, "UPLOAD_ERROR"));
    }
    return next();
  });
}

async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await businessProfileService.getBusinessProfile(
      req.companyId!,
    );
    return sendSuccess(res, company);
  } catch (err) {
    return next(err);
  }
}

async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await businessProfileService.updateBusinessProfile(
      req.companyId!,
      req.body,
    );
    return sendSuccess(res, company);
  } catch (err) {
    return next(err);
  }
}

async function uploadLogo(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw badRequest("Logo file is required", "FILE_REQUIRED");
    }
    const logoUrl = `/${env.UPLOAD_DIR}/${LOGO_SUBDIR}/${req.file.filename}`.replace(
      /\\/g,
      "/",
    );
    const company = await businessProfileService.updateLogo(
      req.companyId!,
      logoUrl,
    );
    return sendSuccess(res, company);
  } catch (err) {
    return next(err);
  }
}

export const businessProfileRouter = Router();
businessProfileRouter.use(
  requireAuth,
  resolveCompanyContext,
  rejectClientCompanyId,
);

businessProfileRouter.get("/", getProfile);
businessProfileRouter.patch(
  "/",
  requireRole("owner", "admin"),
  validate({ body: updateBusinessProfileSchema }),
  updateProfile,
);
businessProfileRouter.post(
  "/logo",
  requireRole("owner", "admin"),
  uploadLogoMiddleware,
  uploadLogo,
);
