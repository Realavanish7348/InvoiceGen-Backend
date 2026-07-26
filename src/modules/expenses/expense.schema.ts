import { z } from "zod";

export const createExpenseSchema = z.object({
  amount: z.number().int().min(0).max(1_000_000_000),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  category: z.string().trim().min(1).max(120),
  date: z.coerce.date(),
  vendor: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
