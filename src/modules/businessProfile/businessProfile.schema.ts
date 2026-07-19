import { z } from "zod";

const addressSchema = z.object({
  street: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  zip: z.string().trim().max(30).optional(),
  country: z.string().trim().max(120).optional(),
});

const brandingSchema = z.object({
  theme: z.string().trim().max(60).optional(),
  primaryColor: z.string().trim().max(20).optional(),
  accentColor: z.string().trim().max(20).optional(),
  fontFamily: z.string().trim().max(60).optional(),
  footer: z.string().trim().max(1000).optional(),
});

export const updateBusinessProfileSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
  phone: z.string().trim().max(40).optional(),
  taxNumber: z.string().trim().max(80).optional(),
  address: addressSchema.optional(),
  branding: brandingSchema.optional(),
});
