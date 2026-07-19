import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import * as notificationService from "./notification.service.js";

const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, page, limit, unreadCount } =
      await notificationService.listNotifications({
        companyId: req.companyId!,
        userId: String(req.user!._id),
        page: req.query.page,
        limit: req.query.limit,
        unreadOnly: req.query.unreadOnly as boolean | undefined,
      });
    const totalPages = Math.ceil(total / limit) || 0;
    return res.status(200).json({
      success: true,
      data: items,
      pagination: { total, page, limit, totalPages },
      meta: { unreadCount },
    });
  } catch (err) {
    return next(err);
  }
}

async function unreadCountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await notificationService.getUnreadCount(
      req.companyId!,
      String(req.user!._id),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

async function markAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const notification = await notificationService.markAsRead(
      req.companyId!,
      String(req.user!._id),
      paramId(req),
    );
    return sendSuccess(res, notification);
  } catch (err) {
    return next(err);
  }
}

async function markAllAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await notificationService.markAllAsRead(
      req.companyId!,
      String(req.user!._id),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

async function deleteNotification(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await notificationService.deleteNotification(
      req.companyId!,
      String(req.user!._id),
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

export const notificationsRouter = Router();
notificationsRouter.use(
  requireAuth,
  resolveCompanyContext,
  rejectClientCompanyId,
);

notificationsRouter.get(
  "/",
  validate({ query: listNotificationsQuerySchema }),
  listNotifications,
);
notificationsRouter.get("/unread-count", unreadCountHandler);
notificationsRouter.patch(
  "/read-all",
  markAllAsRead,
);
notificationsRouter.patch(
  "/:id/read",
  validate({ params: objectIdParamSchema }),
  markAsRead,
);
notificationsRouter.delete(
  "/:id",
  validate({ params: objectIdParamSchema }),
  deleteNotification,
);
