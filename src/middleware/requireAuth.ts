import type { RequestHandler } from "express";
import { User } from "../modules/users/user.model.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { unauthorized } from "../utils/AppError.js";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw unauthorized("UNAUTHORIZED", "Authentication required");
    }

    const token = header.slice("Bearer ".length).trim();
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw unauthorized("TOKEN_INVALID", "Invalid or expired access token");
    }

    const user = await User.findOne({
      _id: payload.sub,
      isDeleted: false,
    }).select("_id email name activeCompanyId emailVerifiedAt");

    if (!user || !user.activeCompanyId) {
      throw unauthorized("UNAUTHORIZED", "Authentication required");
    }

    req.user = {
      _id: user._id,
      email: user.email,
      name: user.name,
      activeCompanyId: user.activeCompanyId,
      emailVerifiedAt: user.emailVerifiedAt,
    };

    next();
  } catch (err) {
    next(err);
  }
};
