import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../../middleware/validate.js";
import { requirePortalAuth } from "../../middleware/requirePortalAuth.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess, sendPaginated } from "../../utils/apiResponse.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import {
  requestPortalLinkSchema,
  verifyPortalLinkSchema,
  listPortalInvoicesQuerySchema,
} from "./portal.schema.js";
import * as portalService from "./portal.service.js";

const portalAuthLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests",
    },
  },
});

async function requestLink(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await portalService.requestMagicLink(req.body.email);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

async function verifyLink(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await portalService.verifyMagicLink(req.body, req, res);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await portalService.refreshPortalSession(req, res);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await portalService.logoutPortal(req, res);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await portalService.getPortalMe(req.portal!.email);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

async function listInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, page, limit } = await portalService.listPortalInvoices({
      email: req.portal!.email,
      page: req.query.page as number | undefined,
      limit: req.query.limit as number | undefined,
      status: req.query.status as string | undefined,
    });
    return sendPaginated(res, items, { total, page, limit });
  } catch (err) {
    return next(err);
  }
}

async function getInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await portalService.getPortalInvoice(
      req.portal!.email,
      paramId(req),
    );
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

async function getPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { buffer, filename } = await portalService.pdfForPortalInvoice(
      req.portal!.email,
      paramId(req),
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

async function checkout(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await portalService.createPortalCheckoutSession(
      req.portal!.email,
      paramId(req),
    );
    return sendSuccess(res, data, 201);
  } catch (err) {
    return next(err);
  }
}

export const portalRouter = Router();

portalRouter.post(
  "/auth/request-link",
  portalAuthLimiter,
  validate({ body: requestPortalLinkSchema }),
  requestLink,
);
portalRouter.post(
  "/auth/verify",
  portalAuthLimiter,
  validate({ body: verifyPortalLinkSchema }),
  verifyLink,
);
portalRouter.post("/auth/refresh", portalAuthLimiter, refresh);
portalRouter.post("/auth/logout", logout);

portalRouter.get("/me", requirePortalAuth, me);
portalRouter.get(
  "/invoices",
  requirePortalAuth,
  validate({ query: listPortalInvoicesQuerySchema }),
  listInvoices,
);
portalRouter.get(
  "/invoices/:id",
  requirePortalAuth,
  validate({ params: objectIdParamSchema }),
  getInvoice,
);
portalRouter.get(
  "/invoices/:id/pdf",
  requirePortalAuth,
  validate({ params: objectIdParamSchema }),
  getPdf,
);
portalRouter.post(
  "/invoices/:id/checkout-session",
  requirePortalAuth,
  validate({ params: objectIdParamSchema }),
  checkout,
);
