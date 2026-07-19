import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { updateSettingsSchema } from "./settings.schema.js";
import * as settingsService from "./settings.service.js";

async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.getOrCreateSettings(
      req.companyId!,
    );
    return sendSuccess(res, settings);
  } catch (err) {
    return next(err);
  }
}

async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.updateSettings(
      req.companyId!,
      req.body,
    );
    return sendSuccess(res, settings);
  } catch (err) {
    return next(err);
  }
}

export const settingsRouter = Router();
settingsRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

settingsRouter.get("/", getSettings);
settingsRouter.patch(
  "/",
  validate({ body: updateSettingsSchema }),
  updateSettings,
);
