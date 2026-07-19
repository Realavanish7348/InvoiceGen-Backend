import type { RequestHandler } from "express";
import { Membership } from "../modules/memberships/membership.model.js";
import { unauthorized, forbidden } from "../utils/AppError.js";

/**
 * Resolves the authenticated user's active company into req.companyId.
 * Never trusts client-supplied companyId.
 */
export const resolveCompanyContext: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.user?.activeCompanyId) {
      throw unauthorized("UNAUTHORIZED", "Authentication required");
    }

    const companyId = String(req.user.activeCompanyId);
    const membership = await Membership.findOne({
      userId: req.user._id,
      companyId,
      status: "active",
    });

    if (!membership) {
      throw forbidden("No active workspace membership");
    }

    req.companyId = companyId;
    req.membershipRole = membership.role;
    next();
  } catch (err) {
    next(err);
  }
};

/** Reject body/query companyId overrides on business routes. */
export const rejectClientCompanyId: RequestHandler = (req, _res, next) => {
  const body = req.body as Record<string, unknown> | undefined;
  if (body && Object.prototype.hasOwnProperty.call(body, "companyId")) {
    delete body.companyId;
  }
  if (Object.prototype.hasOwnProperty.call(req.query, "companyId")) {
    delete (req.query as Record<string, unknown>).companyId;
  }
  next();
};
