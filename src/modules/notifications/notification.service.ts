import { Notification } from "./notification.model.js";
import { parsePagination } from "../../utils/pagination.js";
import { notFound } from "../../utils/AppError.js";

export type ListNotificationsParams = {
  companyId: string;
  userId: string;
  page?: unknown;
  limit?: unknown;
  unreadOnly?: boolean;
};

export async function listNotifications(params: ListNotificationsParams) {
  const { page, limit, skip } = parsePagination(params);
  const filter: Record<string, unknown> = {
    companyId: params.companyId,
    userId: params.userId,
  };
  if (params.unreadOnly) {
    filter.readAt = null;
  }

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({
      companyId: params.companyId,
      userId: params.userId,
      readAt: null,
    }),
  ]);

  return { items, total, page, limit, unreadCount };
}

export async function getUnreadCount(companyId: string, userId: string) {
  const unreadCount = await Notification.countDocuments({
    companyId,
    userId,
    readAt: null,
  });
  return { unreadCount };
}

export async function markAsRead(
  companyId: string,
  userId: string,
  notificationId: string,
) {
  const notification = await Notification.findOne({
    _id: notificationId,
    companyId,
    userId,
  });
  if (!notification) throw notFound("Notification not found");
  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  return notification;
}

export async function markAllAsRead(companyId: string, userId: string) {
  const result = await Notification.updateMany(
    { companyId, userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { updated: result.modifiedCount ?? 0 };
}

export async function deleteNotification(
  companyId: string,
  userId: string,
  notificationId: string,
) {
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    companyId,
    userId,
  });
  if (!notification) throw notFound("Notification not found");
  return { id: String(notification._id) };
}
