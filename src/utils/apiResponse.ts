import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  status = 200,
): Response {
  return res.status(status).json({ success: true, data });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { total: number; page: number; limit: number },
): Response {
  const totalPages = Math.ceil(pagination.total / pagination.limit) || 0;
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total: pagination.total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
    },
  });
}
