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
  createServiceSchema,
  updateServiceSchema,
  listServicesQuerySchema,
} from "./service.schema.js";
import * as serviceService from "./service.service.js";

async function listServices(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, page, limit } = await serviceService.listServices({
      companyId: req.companyId!,
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
    });
    return sendPaginated(res, items, { total, page, limit });
  } catch (err) {
    return next(err);
  }
}

async function getService(req: Request, res: Response, next: NextFunction) {
  try {
    const service = await serviceService.getServiceById(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, service);
  } catch (err) {
    return next(err);
  }
}

async function createService(req: Request, res: Response, next: NextFunction) {
  try {
    const service = await serviceService.createService(
      req.companyId!,
      String(req.user!._id),
      req.body,
    );
    return sendSuccess(res, service, 201);
  } catch (err) {
    return next(err);
  }
}

async function updateService(req: Request, res: Response, next: NextFunction) {
  try {
    const service = await serviceService.updateService(
      req.companyId!,
      paramId(req),
      req.body,
    );
    return sendSuccess(res, service);
  } catch (err) {
    return next(err);
  }
}

async function deleteService(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await serviceService.deleteService(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

export const servicesRouter = Router();
servicesRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

servicesRouter.get(
  "/",
  validate({ query: listServicesQuerySchema }),
  listServices,
);
servicesRouter.get(
  "/:id",
  validate({ params: objectIdParamSchema }),
  getService,
);
servicesRouter.post(
  "/",
  validate({ body: createServiceSchema }),
  createService,
);
servicesRouter.patch(
  "/:id",
  validate({ params: objectIdParamSchema, body: updateServiceSchema }),
  updateService,
);
servicesRouter.delete(
  "/:id",
  validate({ params: objectIdParamSchema }),
  deleteService,
);
