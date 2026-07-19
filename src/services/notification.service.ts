import type { Types } from "mongoose";
import {
  Notification,
  type NotificationDocument,
} from "../modules/notifications/notification.model.js";
import { logger } from "../utils/logger.js";

export type NotificationType = NotificationDocument["type"];

export type CreateNotificationInput = {
  companyId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string | Types.ObjectId;
};

/**
 * Creates an in-app notification. Failures are logged and swallowed so a
 * notification issue never breaks the primary business operation.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationDocument | null> {
  try {
    const doc = await Notification.create({
      companyId: input.companyId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
    return doc;
  } catch (err) {
    logger.error("Failed to create notification", {
      error: err instanceof Error ? err.message : String(err),
      type: input.type,
    });
    return null;
  }
}
