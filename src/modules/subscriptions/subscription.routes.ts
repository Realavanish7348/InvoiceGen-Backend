import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as subscriptionService from "./subscription.service.js";

const changePlanSchema = z.object({
  // Service enforces known plans → INVALID_PLAN (not Zod VALIDATION_ERROR)
  planId: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});

async function listPlans(_req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, subscriptionService.listPlans());
  } catch (err) {
    return next(err);
  }
}

async function getCurrent(req: Request, res: Response, next: NextFunction) {
  try {
    const subscription = await subscriptionService.getCurrentSubscription(
      req.companyId!,
    );
    return sendSuccess(res, subscription);
  } catch (err) {
    return next(err);
  }
}

async function changePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const subscription = await subscriptionService.changePlan(
      req.companyId!,
      String(req.user!._id),
      req.body.planId,
      req.body.note,
    );
    return sendSuccess(res, subscription);
  } catch (err) {
    return next(err);
  }
}

async function getUsage(req: Request, res: Response, next: NextFunction) {
  try {
    const usage = await subscriptionService.getUsage(req.companyId!);
    return sendSuccess(res, usage);
  } catch (err) {
    return next(err);
  }
}

export const subscriptionsRouter = Router();
subscriptionsRouter.use(
  requireAuth,
  resolveCompanyContext,
  rejectClientCompanyId,
);

subscriptionsRouter.get("/plans", listPlans);
subscriptionsRouter.get("/current", getCurrent);
subscriptionsRouter.get("/", getCurrent);
subscriptionsRouter.get("/usage", getUsage);
subscriptionsRouter.post(
  "/change-plan",
  requireRole("owner"),
  validate({ body: changePlanSchema }),
  changePlan,
);
subscriptionsRouter.patch(
  "/",
  requireRole("owner"),
  validate({ body: changePlanSchema }),
  changePlan,
);
