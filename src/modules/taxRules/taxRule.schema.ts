import { z } from "zod";

export const createTaxRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  rateBps: z.number().int().min(0).max(100_000),
  description: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
});

export const updateTaxRuleSchema = createTaxRuleSchema.partial();

export const listTaxRulesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
});
