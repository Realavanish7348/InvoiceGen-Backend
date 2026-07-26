import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import * as paymentService from "./payment.service.js";

async function createCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.createCheckoutSession(
      req.companyId!,
      String(req.user!._id),
      paramId(req),
    );
    return sendSuccess(res, result, 201);
  } catch (err) {
    return next(err);
  }
}

async function getPaymentLink(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.getPaymentLink(
      req.companyId!,
      String(req.user!._id),
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

async function paymentsConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, paymentService.paymentsStatus());
  } catch (err) {
    return next(err);
  }
}

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

paymentsRouter.get("/config", paymentsConfig);
paymentsRouter.post(
  "/invoices/:id/checkout-session",
  validate({ params: objectIdParamSchema }),
  createCheckout,
);
paymentsRouter.get(
  "/invoices/:id/payment-link",
  validate({ params: objectIdParamSchema }),
  getPaymentLink,
);
