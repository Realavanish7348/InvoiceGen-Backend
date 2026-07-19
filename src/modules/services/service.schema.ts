import { z } from "zod";

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  unitPrice: z.number().int().min(0),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  unit: z.string().trim().max(40).default("hour"),
  taxRuleId: objectIdString.optional().nullable(),
  category: z.string().trim().max(120).optional(),
});

export const updateServiceSchema = createServiceSchema.partial();

export const listServicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
});
