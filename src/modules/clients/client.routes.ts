import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { resolveCompanyContext } from "../../middleware/resolveCompanyContext.js";
import { rejectClientCompanyId } from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess, sendPaginated } from "../../utils/apiResponse.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} from "./client.schema.js";
import * as clientService from "./client.service.js";

async function listClients(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, page, limit } = await clientService.listClients({
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

async function getClient(req: Request, res: Response, next: NextFunction) {
  try {
    const client = await clientService.getClientById(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, client);
  } catch (err) {
    return next(err);
  }
}

async function createClient(req: Request, res: Response, next: NextFunction) {
  try {
    const client = await clientService.createClient(
      req.companyId!,
      String(req.user!._id),
      req.body,
    );
    return sendSuccess(res, client, 201);
  } catch (err) {
    return next(err);
  }
}

async function updateClient(req: Request, res: Response, next: NextFunction) {
  try {
    const client = await clientService.updateClient(
      req.companyId!,
      paramId(req),
      req.body,
    );
    return sendSuccess(res, client);
  } catch (err) {
    return next(err);
  }
}

async function deleteClient(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await clientService.deleteClient(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

export const clientsRouter = Router();
clientsRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

clientsRouter.get("/", validate({ query: listClientsQuerySchema }), listClients);
clientsRouter.get(
  "/:id",
  validate({ params: objectIdParamSchema }),
  getClient,
);
clientsRouter.post(
  "/",
  validate({ body: createClientSchema }),
  createClient,
);
clientsRouter.patch(
  "/:id",
  validate({ params: objectIdParamSchema, body: updateClientSchema }),
  updateClient,
);
clientsRouter.delete(
  "/:id",
  validate({ params: objectIdParamSchema }),
  deleteClient,
);
