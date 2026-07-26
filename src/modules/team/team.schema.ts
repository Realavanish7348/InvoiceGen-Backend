import { z } from "zod";

export const createInvitationSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member"]).default("member"),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "member", "owner"]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
});

export const invitationTokenQuerySchema = z.object({
  token: z.string().min(20).max(200),
});
