import { z } from "zod";

export const requestPortalLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

export const verifyPortalLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  token: z.string().min(20).max(200),
});

export const listPortalInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum(["published", "pending", "paid", "overdue", "archived"])
    .optional(),
});
