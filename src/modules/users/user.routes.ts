import type { Request, Response, NextFunction } from "express";
import * as userService from "./user.service.js";
import * as authService from "../auth/auth.service.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import { validate } from "../../middleware/validate.js";
import {
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
  switchActiveCompanySchema,
} from "./user.schema.js";
import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { resolveCompanyContext } from "../../middleware/resolveCompanyContext.js";

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await userService.getMe(String(req.user!._id)));
  } catch (err) {
    return next(err);
  }
}

export async function switchActiveCompany(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return sendSuccess(
      res,
      await userService.switchActiveCompany(
        String(req.user!._id),
        req.body.companyId,
      ),
    );
  } catch (err) {
    return next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(
      res,
      await userService.updateMe(String(req.user!._id), req.body),
    );
  } catch (err) {
    return next(err);
  }
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return sendSuccess(
      res,
      await userService.changePassword(
        String(req.user!._id),
        req.body.currentPassword,
        req.body.newPassword,
      ),
    );
  } catch (err) {
    return next(err);
  }
}

export async function listSessions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return sendSuccess(
      res,
      await authService.listSessions(String(req.user!._id)),
    );
  } catch (err) {
    return next(err);
  }
}

export async function revokeSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return sendSuccess(
      res,
      await authService.revokeSession(String(req.user!._id), paramId(req)),
    );
  } catch (err) {
    return next(err);
  }
}

export async function exportMe(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(
      res,
      await userService.exportMe(String(req.user!._id), req.companyId!),
    );
  } catch (err) {
    return next(err);
  }
}

export async function deleteMe(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await userService.deleteMe(
      String(req.user!._id),
      req.body.confirmation,
    );
    authService.clearRefreshCookie(res);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get("/me", getMe);
usersRouter.patch(
  "/me/active-company",
  validate({ body: switchActiveCompanySchema }),
  switchActiveCompany,
);
usersRouter.patch("/me", validate({ body: updateProfileSchema }), updateMe);
usersRouter.patch(
  "/me/password",
  validate({ body: changePasswordSchema }),
  changePassword,
);
usersRouter.get("/me/sessions", listSessions);
usersRouter.delete(
  "/me/sessions/:id",
  validate({ params: objectIdParamSchema }),
  revokeSession,
);
usersRouter.get("/me/export", resolveCompanyContext, exportMe);
usersRouter.delete(
  "/me",
  validate({ body: deleteAccountSchema }),
  deleteMe,
);
