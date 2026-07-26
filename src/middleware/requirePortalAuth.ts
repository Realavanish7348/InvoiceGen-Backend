import type { RequestHandler } from "express";
import { verifyPortalAccessToken } from "../utils/jwt.js";
import { unauthorized } from "../utils/AppError.js";
import { PortalSession } from "../modules/portal/portalSession.model.js";

export const requirePortalAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw unauthorized("UNAUTHORIZED", "Portal authentication required");
    }

    const token = header.slice("Bearer ".length).trim();
    let payload;
    try {
      payload = verifyPortalAccessToken(token);
    } catch {
      throw unauthorized("TOKEN_INVALID", "Invalid or expired portal access token");
    }

    const session = await PortalSession.findOne({
      _id: payload.sid,
      email: payload.sub.toLowerCase().trim(),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      throw unauthorized("TOKEN_INVALID", "Invalid or expired portal session");
    }

    req.portal = {
      email: payload.sub.toLowerCase().trim(),
      sessionId: String(session._id),
    };

    next();
  } catch (err) {
    next(err);
  }
};
