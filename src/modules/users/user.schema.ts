import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional().nullable(),
  timezone: z.string().max(64).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const deleteAccountSchema = z.object({
  // Service enforces exact text → CONFIRM_TEXT_MISMATCH (not Zod VALIDATION_ERROR)
  confirmation: z.string().min(1).max(64),
});

export const switchActiveCompanySchema = z.object({
  companyId: z.string().regex(/^[a-f\d]{24}$/i),
});
