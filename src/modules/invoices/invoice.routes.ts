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
  createInvoiceSchema,
  updateInvoiceSchema,
  invoiceStatusSchema,
  listInvoicesQuerySchema,
} from "./invoice.schema.js";
import * as invoiceService from "./invoice.service.js";

async function listInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      search?: string;
      status?: string;
      clientId?: string;
      currency?: string;
      from?: Date;
      to?: Date;
      includeDeleted?: boolean;
    };
    const { data, total, page, limit } = await invoiceService.listInvoices(
      req.companyId!,
      q,
    );
    return sendPaginated(res, data, { total, page, limit });
  } catch (err) {
    return next(err);
  }
}

async function getInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.getInvoice(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, invoice);
  } catch (err) {
    return next(err);
  }
}

async function createInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.createInvoice(
      req.companyId!,
      String(req.user!._id),
      req.body,
    );
    return sendSuccess(res, invoice, 201);
  } catch (err) {
    return next(err);
  }
}

async function updateInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.updateInvoice(
      req.companyId!,
      paramId(req),
      req.body,
    );
    return sendSuccess(res, invoice);
  } catch (err) {
    return next(err);
  }
}

async function publishInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.publishInvoice(
      req.companyId!,
      String(req.user!._id),
      paramId(req),
    );
    return sendSuccess(res, invoice);
  } catch (err) {
    return next(err);
  }
}

async function changeStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.changeStatus(
      req.companyId!,
      String(req.user!._id),
      paramId(req),
      req.body.status,
    );
    return sendSuccess(res, invoice);
  } catch (err) {
    return next(err);
  }
}

async function duplicateInvoice(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const invoice = await invoiceService.duplicateInvoice(
      req.companyId!,
      String(req.user!._id),
      paramId(req),
    );
    return sendSuccess(res, invoice, 201);
  } catch (err) {
    return next(err);
  }
}

async function restoreInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.restoreInvoice(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, invoice);
  } catch (err) {
    return next(err);
  }
}

async function deleteInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await invoiceService.softDeleteInvoice(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

async function downloadPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { buffer, filename } = await invoiceService.pdfForInvoice(
      req.companyId!,
      paramId(req),
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    return res.status(200).send(buffer);
  } catch (err) {
    return next(err);
  }
}

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

invoicesRouter.get(
  "/",
  validate({ query: listInvoicesQuerySchema }),
  listInvoices,
);
invoicesRouter.post("/", validate({ body: createInvoiceSchema }), createInvoice);
invoicesRouter.get(
  "/:id",
  validate({ params: objectIdParamSchema }),
  getInvoice,
);
invoicesRouter.patch(
  "/:id",
  validate({ params: objectIdParamSchema, body: updateInvoiceSchema }),
  updateInvoice,
);
invoicesRouter.post(
  "/:id/publish",
  validate({ params: objectIdParamSchema }),
  publishInvoice,
);
invoicesRouter.post(
  "/:id/status",
  validate({ params: objectIdParamSchema, body: invoiceStatusSchema }),
  changeStatus,
);
invoicesRouter.post(
  "/:id/duplicate",
  validate({ params: objectIdParamSchema }),
  duplicateInvoice,
);
invoicesRouter.post(
  "/:id/restore",
  validate({ params: objectIdParamSchema }),
  restoreInvoice,
);
invoicesRouter.delete(
  "/:id",
  validate({ params: objectIdParamSchema }),
  deleteInvoice,
);
invoicesRouter.get(
  "/:id/pdf",
  validate({ params: objectIdParamSchema }),
  downloadPdf,
);
