import { z } from "zod";

const colorsSchema = z.object({
  primary: z.string().trim().max(20).optional(),
  accent: z.string().trim().max(20).optional(),
  text: z.string().trim().max(20).optional(),
});

const fontsSchema = z.object({
  heading: z.string().trim().max(60).optional(),
  body: z.string().trim().max(60).optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isDefault: z.boolean().optional(),
  layout: z.enum(["classic", "modern", "minimal", "compact"]).optional(),
  colors: colorsSchema.optional(),
  fonts: fontsSchema.optional(),
  showLogo: z.boolean().optional(),
  showWatermark: z.boolean().optional(),
  watermarkText: z.string().trim().max(60).optional(),
  footer: z.string().trim().max(1000).optional(),
  signatureUrl: z.string().trim().max(500).optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const listTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
});
