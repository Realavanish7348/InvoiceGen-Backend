import bcrypt from "bcryptjs";
import { User } from "./user.model.js";
import { Company } from "../companies/company.model.js";
import { Membership } from "../memberships/membership.model.js";
import { Client } from "../clients/client.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import { Session } from "../auth/session.model.js";
import { Settings } from "../settings/settings.model.js";
import { Subscription } from "../subscriptions/subscription.model.js";
import { notFound, unauthorized, badRequest, forbidden } from "../../utils/AppError.js";
import * as authService from "../auth/auth.service.js";

export async function getMe(userId: string) {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) throw notFound("User not found");
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone ?? "UTC",
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    activeCompanyId: user.activeCompanyId
      ? String(user.activeCompanyId)
      : null,
  };
}

export async function switchActiveCompany(userId: string, companyId: string) {
  const membership = await Membership.findOne({
    userId,
    companyId,
    status: "active",
  });
  if (!membership) {
    throw forbidden("You are not a member of that workspace");
  }
  const company = await Company.findOne({ _id: companyId, isDeleted: false });
  if (!company) throw notFound("Workspace not found");

  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $set: { activeCompanyId: companyId } },
    { new: true },
  );
  if (!user) throw notFound("User not found");

  return getMe(userId);
}

export async function updateMe(
  userId: string,
  input: {
    name?: string;
    phone?: string | null;
    timezone?: string;
    avatarUrl?: string | null;
  },
) {
  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $set: input },
    { new: true },
  );
  if (!user) throw notFound("User not found");
  return getMe(userId);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "+passwordHash",
  );
  if (!user) throw notFound("User not found");
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw unauthorized("UNAUTHORIZED", "Current password is incorrect");
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return { message: "Password updated. Please sign in again." };
}

export async function exportMe(userId: string, companyId: string) {
  const [user, company, memberships, clients, invoices, settings, subscription] =
    await Promise.all([
      User.findById(userId).select("-passwordHash"),
      Company.findById(companyId),
      Membership.find({ userId }),
      Client.find({ companyId, isDeleted: false }),
      Invoice.find({ companyId, isDeleted: false }),
      Settings.findOne({ companyId }),
      Subscription.findOne({ companyId }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    company,
    memberships,
    clients,
    invoices,
    settings,
    subscription,
  };
}

export async function deleteMe(userId: string, confirmation: string) {
  if (confirmation !== "DELETE MY ACCOUNT") {
    throw badRequest(
      "Confirmation text mismatch",
      "CONFIRM_TEXT_MISMATCH",
    );
  }
  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) throw notFound("User not found");

  const now = new Date();
  user.isDeleted = true;
  user.deletedAt = now;
  await user.save();

  if (user.activeCompanyId) {
    await Company.findByIdAndUpdate(user.activeCompanyId, {
      isDeleted: true,
      deletedAt: now,
    });
  }

  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: now } },
  );
  await Membership.updateMany(
    { userId },
    { $set: { status: "revoked" } },
  );

  return { message: "Account deleted" };
}

export { authService };
