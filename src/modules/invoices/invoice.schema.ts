import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  sort: z.string().max(50).optional(),
});

export const invoiceLineSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().int().min(0),
  productId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  serviceId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

export const createInvoiceSchema = z.object({
  clientId: z.string().regex(/^[a-f\d]{24}$/i),
  templateId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  currency: z.string().length(3).default("USD"),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  items: z.array(invoiceLineSchema).min(1),
  discountAmount: z.number().int().min(0).default(0),
  taxRuleId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  shippingAmount: z.number().int().min(0).default(0),
  notes: z.string().max(5000).optional(),
  terms: z.string().max(5000).optional(),
  paymentInstructions: z.string().max(5000).optional(),
  footer: z.string().max(2000).optional(),
});

/** Partial update — no `.default()` so notes-only patches do not inject financial keys. */
export const updateInvoiceSchema = z.object({
  clientId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  templateId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  currency: z.string().length(3).optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  items: z.array(invoiceLineSchema).min(1).optional(),
  discountAmount: z.number().int().min(0).optional(),
  taxRuleId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  shippingAmount: z.number().int().min(0).optional(),
  notes: z.string().max(5000).optional(),
  terms: z.string().max(5000).optional(),
  paymentInstructions: z.string().max(5000).optional(),
  footer: z.string().max(2000).optional(),
});

export const invoiceStatusSchema = z.object({
  status: z.enum(["pending", "paid", "archived"]),
});

export const listInvoicesQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(["draft", "published", "pending", "paid", "overdue", "archived"])
    .optional(),
  clientId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  currency: z.string().length(3).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  includeDeleted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
