import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { Invitation } from "./invitation.model.js";
import { Membership } from "../memberships/membership.model.js";
import { User } from "../users/user.model.js";
import { Company } from "../companies/company.model.js";
import { Settings } from "../settings/settings.model.js";
import { Subscription } from "../subscriptions/subscription.model.js";
import { badRequest, conflict, forbidden, notFound } from "../../utils/AppError.js";
import { randomToken, sha256 } from "../../utils/tokenCompare.js";
import { sendEmail } from "../../services/email.service.js";
import { env } from "../../config/env.js";
import type { MembershipRole } from "../../middleware/requireRole.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function serializeMember(m: {
  _id: { toString(): string };
  userId: { _id?: { toString(): string }; email?: string; name?: string } | string;
  role: string;
  status: string;
  createdAt?: Date;
}) {
  const user =
    typeof m.userId === "object" && m.userId && "_id" in m.userId
      ? m.userId
      : null;
  return {
    id: String(m._id),
    userId: user?._id ? String(user._id) : String(m.userId),
    email: user?.email ?? null,
    name: user?.name ?? null,
    role: m.role,
    status: m.status,
    createdAt: m.createdAt ?? null,
  };
}

export async function listMembers(companyId: string) {
  const members = await Membership.find({ companyId, status: "active" })
    .populate("userId", "email name")
    .sort({ createdAt: 1 });
  return members.map((m) => serializeMember(m));
}

export async function listWorkspaces(userId: string) {
  const memberships = await Membership.find({
    userId,
    status: "active",
  }).populate("companyId", "name logoUrl isDeleted");

  const user = await User.findById(userId);
  const activeId = user?.activeCompanyId
    ? String(user.activeCompanyId)
    : null;

  return memberships
    .filter((m) => {
      const company = m.companyId as unknown as {
        _id?: { toString(): string };
        name?: string;
        isDeleted?: boolean;
      } | null;
      return Boolean(company && typeof company === "object" && !company.isDeleted);
    })
    .map((m) => {
      const company = m.companyId as unknown as {
        _id: { toString(): string };
        name: string;
        logoUrl?: string;
      };
      const id = String(company._id);
      return {
        companyId: id,
        name: company.name,
        logoUrl: company.logoUrl ?? null,
        role: m.role,
        isActive: id === activeId,
      };
    });
}

export async function createWorkspace(userId: string, name: string) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [company] = await Company.create([{ name: name.trim() }], {
      session,
    });
    await Membership.create(
      [
        {
          userId,
          companyId: company!._id,
          role: "owner",
          status: "active",
        },
      ],
      { session },
    );
    await Settings.create(
      [{ companyId: company!._id, defaultCurrency: "USD" }],
      { session },
    );
    await Subscription.create(
      [
        {
          companyId: company!._id,
          planId: "free",
          history: [{ planId: "free", note: "Initial plan" }],
        },
      ],
      { session },
    );

    const user = await User.findById(userId).session(session);
    if (!user) throw notFound("User not found");
    user.activeCompanyId = company!._id;
    await user.save({ session });

    await session.commitTransaction();

    return {
      companyId: String(company!._id),
      name: company!.name,
      role: "owner" as const,
      isActive: true,
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function listInvitations(companyId: string) {
  const invites = await Invitation.find({
    companyId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  return invites.map((i) => ({
    id: String(i._id),
    email: i.email,
    role: i.role,
    invitedByUserId: String(i.invitedByUserId),
    expiresAt: i.expiresAt,
    createdAt: i.createdAt,
  }));
}

export async function createInvitation(
  companyId: string,
  invitedByUserId: string,
  actorRole: MembershipRole,
  input: { email: string; role: "admin" | "member" },
) {
  if (actorRole === "admin" && input.role === "admin") {
    throw forbidden("Admins can only invite members");
  }

  const email = input.email.toLowerCase().trim();
  const company = await Company.findById(companyId);
  if (!company || company.isDeleted) throw notFound("Company not found");

  const existingUser = await User.findOne({ email, isDeleted: false });
  if (existingUser) {
    const existingMembership = await Membership.findOne({
      userId: existingUser._id,
      companyId,
      status: "active",
    });
    if (existingMembership) {
      throw conflict("User is already a member of this workspace");
    }
  }

  const pending = await Invitation.findOne({
    companyId,
    email,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
  if (pending) {
    throw conflict("A pending invitation already exists for this email");
  }

  const raw = randomToken(32);
  const invite = await Invitation.create({
    companyId,
    email,
    role: input.role,
    invitedByUserId,
    tokenHash: sha256(raw),
    status: "pending",
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  const url = `${env.CLIENT_URL}/accept-invite?token=${raw}`;
  await sendEmail({
    to: email,
    subject: `You're invited to ${company.name} on InvoiceGen`,
    html: `<p>You've been invited to join <strong>${company.name}</strong> as <strong>${input.role}</strong>.</p><p><a href="${url}">${url}</a></p>`,
    text: `You've been invited to join ${company.name} as ${input.role}. Accept: ${url}`,
  });

  return {
    id: String(invite._id),
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  };
}

export async function revokeInvitation(
  companyId: string,
  invitationId: string,
) {
  const invite = await Invitation.findOne({ _id: invitationId, companyId });
  if (!invite) throw notFound("Invitation not found");
  if (invite.status !== "pending") {
    throw badRequest("Invitation is not pending");
  }
  invite.status = "revoked";
  await invite.save();
  return { message: "Invitation revoked" };
}

export async function previewInvitation(token: string) {
  const invite = await Invitation.findOne({
    tokenHash: sha256(token),
    status: "pending",
  });
  if (!invite || invite.expiresAt < new Date()) {
    throw badRequest("Invalid or expired invitation", "INVITE_INVALID");
  }
  const company = await Company.findById(invite.companyId);
  return {
    email: invite.email,
    role: invite.role,
    companyName: company?.name ?? "Workspace",
    expiresAt: invite.expiresAt,
  };
}

export async function acceptInvitation(
  token: string,
  options: {
    userId?: string;
    name?: string;
    password?: string;
  },
) {
  const invite = await Invitation.findOne({
    tokenHash: sha256(token),
    status: "pending",
  });
  if (!invite || invite.expiresAt < new Date()) {
    throw badRequest("Invalid or expired invitation", "INVITE_INVALID");
  }

  let user = options.userId
    ? await User.findById(options.userId)
    : await User.findOne({ email: invite.email, isDeleted: false });

  if (options.userId && user && user.email.toLowerCase() !== invite.email) {
    throw forbidden("Signed-in email does not match the invitation");
  }

  if (!user) {
    if (!options.name || !options.password) {
      throw badRequest(
        "name and password are required to create an account for this invite",
        "INVITE_ACCOUNT_REQUIRED",
      );
    }
    const passwordHash = await bcrypt.hash(options.password, 12);
    user = await User.create({
      email: invite.email,
      name: options.name,
      passwordHash,
      activeCompanyId: invite.companyId,
      emailVerifiedAt: new Date(),
    });
  } else if (!options.userId) {
    if (!options.password) {
      throw badRequest(
        "An account already exists for this email. Log in and accept the invite, or provide your password.",
        "INVITE_LOGIN_REQUIRED",
      );
    }
    const withHash = await User.findById(user._id).select("+passwordHash");
    const ok =
      withHash?.passwordHash &&
      (await bcrypt.compare(options.password, withHash.passwordHash));
    if (!ok) {
      throw badRequest("Invalid password for existing account", "UNAUTHORIZED");
    }
  }

  let membership = await Membership.findOne({
    userId: user._id,
    companyId: invite.companyId,
  });

  if (membership?.status === "active") {
    invite.status = "accepted";
    await invite.save();
    throw conflict("Already a member of this workspace");
  }

  if (membership) {
    membership.status = "active";
    membership.role = invite.role;
    await membership.save();
  } else {
    membership = await Membership.create({
      userId: user._id,
      companyId: invite.companyId,
      role: invite.role,
      status: "active",
    });
  }

  user.activeCompanyId = invite.companyId as typeof user.activeCompanyId;
  await user.save();

  invite.status = "accepted";
  await invite.save();

  return {
    membership: serializeMember(membership),
    activeCompanyId: String(invite.companyId),
  };
}

export async function updateMemberRole(
  companyId: string,
  actorUserId: string,
  actorRole: MembershipRole,
  targetUserId: string,
  newRole: MembershipRole,
) {
  if (actorRole !== "owner") {
    throw forbidden("Only owners can change member roles");
  }
  if (actorUserId === targetUserId && newRole !== "owner") {
    const owners = await Membership.countDocuments({
      companyId,
      role: "owner",
      status: "active",
    });
    if (owners <= 1) {
      throw badRequest("Cannot demote the only owner");
    }
  }

  const membership = await Membership.findOne({
    companyId,
    userId: targetUserId,
    status: "active",
  }).populate("userId", "email name");

  if (!membership) throw notFound("Member not found");

  if (membership.role === "owner" && newRole !== "owner") {
    const owners = await Membership.countDocuments({
      companyId,
      role: "owner",
      status: "active",
    });
    if (owners <= 1) {
      throw badRequest("Cannot demote the only owner");
    }
  }

  membership.role = newRole;
  await membership.save();
  return serializeMember(membership);
}

export async function removeMember(
  companyId: string,
  actorUserId: string,
  actorRole: MembershipRole,
  targetUserId: string,
) {
  if (actorUserId === targetUserId) {
    throw badRequest("Use leave workspace to remove yourself");
  }

  const membership = await Membership.findOne({
    companyId,
    userId: targetUserId,
    status: "active",
  });
  if (!membership) throw notFound("Member not found");

  if (membership.role === "owner") {
    throw forbidden("Cannot remove an owner");
  }
  if (actorRole === "admin" && membership.role === "admin") {
    throw forbidden("Admins cannot remove other admins");
  }
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw forbidden("Insufficient permissions");
  }

  membership.status = "revoked";
  await membership.save();

  const user = await User.findById(targetUserId);
  if (user && String(user.activeCompanyId) === companyId) {
    const other = await Membership.findOne({
      userId: targetUserId,
      status: "active",
      companyId: { $ne: companyId },
    });
    if (other) {
      user.activeCompanyId = other.companyId as typeof user.activeCompanyId;
      await user.save();
    }
  }

  return { message: "Member removed" };
}
