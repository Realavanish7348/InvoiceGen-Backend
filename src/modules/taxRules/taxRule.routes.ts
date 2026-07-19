import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess, sendPaginated } from "../../utils/apiResponse.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import {
  createTaxRuleSchema,
  updateTaxRuleSchema,
  listTaxRulesQuerySchema,
} from "./taxRule.schema.js";
import * as taxRuleService from "./taxRule.service.js";

async function listTaxRules(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, page, limit } = await taxRuleService.listTaxRules({
      companyId: req.companyId!,
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search as string | undefined,
    });
    return sendPaginated(res, items, { total, page, limit });
  } catch (err) {
    return next(err);
  }
}

async function getTaxRule(req: Request, res: Response, next: NextFunction) {
  try {
    const taxRule = await taxRuleService.getTaxRuleById(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, taxRule);
  } catch (err) {
    return next(err);
  }
}

async function createTaxRule(req: Request, res: Response, next: NextFunction) {
  try {
    const taxRule = await taxRuleService.createTaxRule(
      req.companyId!,
      String(req.user!._id),
      req.body,
    );
    return sendSuccess(res, taxRule, 201);
  } catch (err) {
    return next(err);
  }
}

async function updateTaxRule(req: Request, res: Response, next: NextFunction) {
  try {
    const taxRule = await taxRuleService.updateTaxRule(
      req.companyId!,
      paramId(req),
      req.body,
    );
    return sendSuccess(res, taxRule);
  } catch (err) {
    return next(err);
  }
}

async function deleteTaxRule(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await taxRuleService.deleteTaxRule(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

export const taxRulesRouter = Router();
taxRulesRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

taxRulesRouter.get(
  "/",
  validate({ query: listTaxRulesQuerySchema }),
  listTaxRules,
);
taxRulesRouter.get(
  "/:id",
  validate({ params: objectIdParamSchema }),
  getTaxRule,
);
taxRulesRouter.post(
  "/",
  validate({ body: createTaxRuleSchema }),
  createTaxRule,
);
taxRulesRouter.patch(
  "/:id",
  validate({ params: objectIdParamSchema, body: updateTaxRuleSchema }),
  updateTaxRule,
);
taxRulesRouter.delete(
  "/:id",
  validate({ params: objectIdParamSchema }),
  deleteTaxRule,
);
