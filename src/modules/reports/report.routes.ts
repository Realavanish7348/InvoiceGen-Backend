import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { reportSummaryQuerySchema } from "./report.schema.js";
import * as reportService from "./report.service.js";

type SummaryQuery = { from: Date; to: Date };

function summaryQuery(req: Request): SummaryQuery {
  return req.query as unknown as SummaryQuery;
}

async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = summaryQuery(req);
    const data = await reportService.getReportSummary(req.companyId!, from, to);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

async function getCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = summaryQuery(req);
    const csv = await reportService.getReportCsv(req.companyId!, from, to);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report-summary.csv"',
    );
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

reportsRouter.get(
  "/summary",
  validate({ query: reportSummaryQuerySchema }),
  getSummary,
);
reportsRouter.get(
  "/summary.csv",
  validate({ query: reportSummaryQuerySchema }),
  getCsv,
);
