import type { RequestHandler } from "express";
import { forbidden } from "../utils/AppError.js";

export type MembershipRole = "owner" | "admin" | "member";

/**
 * Requires `resolveCompanyContext` first so `req.membershipRole` is set.
 */
export function requireRole(
  ...allowed: MembershipRole[]
): RequestHandler {
  return (req, _res, next) => {
    const role = req.membershipRole as MembershipRole | undefined;
    if (!role || !allowed.includes(role)) {
      return next(
        forbidden(
          `Requires one of roles: ${allowed.join(", ")}`,
        ),
      );
    }
    return next();
  };
}
