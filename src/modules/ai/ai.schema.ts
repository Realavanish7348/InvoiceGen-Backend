import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

export const aiInvoiceDraftSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  clientId: objectId.optional(),
});

export const aiInsightsSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  question: z.string().trim().max(1000).optional(),
});

/** Structured LLM output for invoice draft (before client resolution). */
export const aiInvoiceSuggestionSchema = z.object({
  clientHint: z.string().trim().max(200).optional(),
  currency: z.string().length(3).default("USD"),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        quantity: z.number().positive(),
        unitPrice: z.number().int().min(0),
        catalogHint: z.string().max(200).optional(),
      }),
    )
    .min(1),
  discountAmount: z.number().int().min(0).default(0),
  shippingAmount: z.number().int().min(0).default(0),
  notes: z.string().max(5000).optional(),
  terms: z.string().max(5000).optional(),
  paymentInstructions: z.string().max(5000).optional(),
  footer: z.string().max(2000).optional(),
});

export const aiExpenseScanSchema = z.object({
  amount: z.number().int().min(0).max(1_000_000_000),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  category: z.string().trim().min(1).max(120),
  date: z.string().min(1),
  vendor: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const aiInsightsResponseSchema = z.object({
  summary: z.string().min(1).max(4000),
  bullets: z.array(z.string().max(500)).max(12),
});
