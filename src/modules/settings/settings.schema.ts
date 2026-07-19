import { z } from "zod";

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const emailPreferencesSchema = z.object({
  invoiceReminders: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
});

export const updateSettingsSchema = z.object({
  defaultCurrency: z.string().trim().length(3).toUpperCase().optional(),
  defaultTaxRuleId: objectIdString.optional().nullable(),
  defaultDueDays: z.number().int().min(0).max(365).optional(),
  paymentTerms: z.string().trim().max(2000).optional(),
  paymentInstructions: z.string().trim().max(2000).optional(),
  invoiceNotes: z.string().trim().max(2000).optional(),
  invoiceFooter: z.string().trim().max(2000).optional(),
  invoicePrefix: z.string().trim().max(20).optional(),
  nextInvoiceNumber: z.number().int().min(1).optional(),
  emailPreferences: emailPreferencesSchema.optional(),
});
