import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as dashboardService from "./dashboard.service.js";
import type { DashboardRange } from "./dashboard.service.js";

const rangeQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d", "12m"]).optional(),
});

const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await dashboardService.getSummary(req.companyId!);
    return sendSuccess(res, summary);
  } catch (err) {
    return next(err);
  }
}

async function getCharts(req: Request, res: Response, next: NextFunction) {
  try {
    const range = (req.query.range as DashboardRange | undefined) ?? "30d";
    const charts = await dashboardService.getCharts(req.companyId!, range);
    return sendSuccess(res, charts);
  } catch (err) {
    return next(err);
  }
}

async function getRecentActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = (req.query.limit as number | undefined) ?? 10;
    const activity = await dashboardService.getRecentActivity(
      req.companyId!,
      limit,
    );
    return sendSuccess(res, activity);
  } catch (err) {
    return next(err);
  }
}

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

dashboardRouter.get("/summary", getSummary);
dashboardRouter.get("/charts", validate({ query: rangeQuerySchema }), getCharts);
dashboardRouter.get(
  "/recent-activity",
  validate({ query: recentActivityQuerySchema }),
  getRecentActivity,
);
