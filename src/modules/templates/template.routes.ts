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
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from "./template.schema.js";
import * as templateService from "./template.service.js";

async function listTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, page, limit } = await templateService.listTemplates({
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

async function getTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await templateService.getTemplateById(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, template);
  } catch (err) {
    return next(err);
  }
}

async function createTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await templateService.createTemplate(
      req.companyId!,
      String(req.user!._id),
      req.body,
    );
    return sendSuccess(res, template, 201);
  } catch (err) {
    return next(err);
  }
}

async function updateTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await templateService.updateTemplate(
      req.companyId!,
      paramId(req),
      req.body,
    );
    return sendSuccess(res, template);
  } catch (err) {
    return next(err);
  }
}

async function deleteTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await templateService.deleteTemplate(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

export const templatesRouter = Router();
templatesRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

templatesRouter.get(
  "/",
  validate({ query: listTemplatesQuerySchema }),
  listTemplates,
);
templatesRouter.get(
  "/:id",
  validate({ params: objectIdParamSchema }),
  getTemplate,
);
templatesRouter.post(
  "/",
  validate({ body: createTemplateSchema }),
  createTemplate,
);
templatesRouter.patch(
  "/:id",
  validate({ params: objectIdParamSchema, body: updateTemplateSchema }),
  updateTemplate,
);
templatesRouter.delete(
  "/:id",
  validate({ params: objectIdParamSchema }),
  deleteTemplate,
);
