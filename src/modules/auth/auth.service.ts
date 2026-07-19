import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { User } from "../users/user.model.js";
import { Company } from "../companies/company.model.js";
import { Membership } from "../memberships/membership.model.js";
import { Settings } from "../settings/settings.model.js";
import { Subscription } from "../subscriptions/subscription.model.js";
import { Session } from "./session.model.js";
import { AuthToken } from "./authToken.model.js";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../services/email.service.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.js";
import { randomToken, sha256, safeCompare } from "../../utils/tokenCompare.js";
import {
  AppError,
  badRequest,
  conflict,
  unauthorized,
} from "../../utils/AppError.js";

const BCRYPT_COST = 12;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const REFRESH_COOKIE = "refreshToken";

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
  });
}

function publicUser(user: {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;
  phone?: string | null;
  timezone?: string | null;
  emailVerifiedAt?: Date | null;
  activeCompanyId?: mongoose.Types.ObjectId | null;
}) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    timezone: user.timezone ?? "UTC",
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    activeCompanyId: user.activeCompanyId ? String(user.activeCompanyId) : null,
  };
}

async function createSession(params: {
  userId: mongoose.Types.ObjectId;
  refreshToken: string;
  userAgent?: string;
  ip?: string;
}) {
  const refreshTokenHash = await bcrypt.hash(params.refreshToken, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return Session.create({
    userId: params.userId,
    refreshTokenHash,
    userAgent: params.userAgent,
    ip: params.ip,
    expiresAt,
  });
}

async function issueTokens(
  userId: mongoose.Types.ObjectId,
  req: Request,
  res: Response,
) {
  const tempSession = await Session.create({
    userId,
    refreshTokenHash: "pending",
    userAgent: req.get("user-agent") ?? undefined,
    ip: req.ip,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const accessToken = signAccessToken(String(userId), String(tempSession._id));
  const refreshToken = signRefreshToken(String(userId), String(tempSession._id));
  tempSession.refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_COST);
  await tempSession.save();
  setRefreshCookie(res, refreshToken);
  return { accessToken, sessionId: String(tempSession._id) };
}

export async function register(
  input: { email: string; password: string; name: string },
  req: Request,
  res: Response,
) {
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) {
    throw conflict("Unable to register with provided credentials");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [user] = await User.create(
      [
        {
          email,
          passwordHash,
          name: input.name.trim(),
        },
      ],
      { session },
    );

    const [company] = await Company.create(
      [{ name: `${input.name.trim()}'s Business` }],
      { session },
    );

    await Membership.create(
      [
        {
          userId: user!._id,
          companyId: company!._id,
          role: "owner",
          status: "active",
        },
      ],
      { session },
    );

    user!.activeCompanyId = company!._id;
    await user!.save({ session });

    await Settings.create(
      [
        {
          companyId: company!._id,
          defaultCurrency: "USD",
        },
      ],
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

    const rawVerify = randomToken(32);
    await AuthToken.create(
      [
        {
          userId: user!._id,
          tokenHash: sha256(rawVerify),
          type: "email_verification",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ],
      { session },
    );

    await session.commitTransaction();

    await sendVerificationEmail(email, rawVerify);
    const tokens = await issueTokens(user!._id, req, res);

    return {
      user: publicUser(user!),
      accessToken: tokens.accessToken,
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function login(
  input: { email: string; password: string },
  req: Request,
  res: Response,
) {
  const email = input.email.toLowerCase().trim();
  const user = await User.findOne({ email, isDeleted: false }).select(
    "+passwordHash",
  );

  const generic = () =>
    unauthorized("UNAUTHORIZED", "Invalid email or password");

  if (!user) throw generic();

  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    throw new AppError(
      403,
      "ACCOUNT_LOCKED",
      "Account temporarily locked. Try again later.",
    );
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED) {
      user.lockUntil = new Date(Date.now() + LOCK_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw generic();
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const tokens = await issueTokens(user._id, req, res);
  return {
    user: publicUser(user),
    accessToken: tokens.accessToken,
  };
}

export async function refresh(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!raw) {
    throw unauthorized("REFRESH_TOKEN_INVALID", "Refresh token missing");
  }

  let payload;
  try {
    payload = verifyRefreshToken(raw);
  } catch {
    clearRefreshCookie(res);
    throw unauthorized("REFRESH_TOKEN_INVALID", "Refresh token invalid");
  }

  const sessionDoc = await Session.findById(payload.sid);
  if (!sessionDoc || sessionDoc.revokedAt) {
    clearRefreshCookie(res);
    throw unauthorized("REFRESH_TOKEN_INVALID", "Refresh token invalid");
  }

  const matches = await bcrypt.compare(raw, sessionDoc.refreshTokenHash);
  if (!matches) {
    // Reuse detection — revoke all sessions for user
    await Session.updateMany(
      { userId: sessionDoc.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    clearRefreshCookie(res);
    throw unauthorized("REFRESH_TOKEN_INVALID", "Refresh token reuse detected");
  }

  sessionDoc.revokedAt = new Date();
  await sessionDoc.save();

  const accessToken = signAccessToken(payload.sub, payload.sid);
  // Create rotated session
  const newRefresh = signRefreshToken(payload.sub, "pending");
  const newSession = await createSession({
    userId: sessionDoc.userId,
    refreshToken: "temp",
    userAgent: req.get("user-agent") ?? undefined,
    ip: req.ip,
  });

  const rotatedRefresh = signRefreshToken(payload.sub, String(newSession._id));
  newSession.refreshTokenHash = await bcrypt.hash(rotatedRefresh, BCRYPT_COST);
  sessionDoc.replacedBySessionId = newSession._id;
  await Promise.all([newSession.save(), sessionDoc.save()]);

  // Fix access token to use new session id
  const newAccess = signAccessToken(payload.sub, String(newSession._id));
  void accessToken;
  void newRefresh;

  setRefreshCookie(res, rotatedRefresh);
  return { accessToken: newAccess };
}

export async function logout(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (raw) {
    try {
      const payload = verifyRefreshToken(raw);
      await Session.findByIdAndUpdate(payload.sid, {
        revokedAt: new Date(),
      });
    } catch {
      // ignore
    }
  }
  clearRefreshCookie(res);
  return { ok: true };
}

export async function logoutAll(userId: string, res: Response) {
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  clearRefreshCookie(res);
  return { ok: true };
}

export async function forgotPassword(emailRaw: string) {
  const email = emailRaw.toLowerCase().trim();
  const user = await User.findOne({ email, isDeleted: false });
  // Always generic
  if (user) {
    const raw = randomToken(32);
    await AuthToken.create({
      userId: user._id,
      tokenHash: sha256(raw),
      type: "password_reset",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await sendPasswordResetEmail(email, raw);
  }
  return {
    message: "If an account exists, a reset email has been sent",
  };
}

export async function resetPassword(token: string, password: string) {
  const tokenHash = sha256(token);
  const record = await AuthToken.findOne({
    tokenHash,
    type: "password_reset",
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!record) {
    throw badRequest("Invalid or expired reset token");
  }

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await User.findByIdAndUpdate(record.userId, {
    passwordHash: hash,
    failedLoginAttempts: 0,
    lockUntil: null,
  });
  record.usedAt = new Date();
  await record.save();
  await Session.updateMany(
    { userId: record.userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return { message: "Password updated" };
}

export async function verifyEmail(token: string) {
  const tokenHash = sha256(token);
  const record = await AuthToken.findOne({
    tokenHash,
    type: "email_verification",
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!record) {
    throw badRequest("Invalid or expired verification token");
  }
  await User.findByIdAndUpdate(record.userId, {
    emailVerifiedAt: new Date(),
  });
  record.usedAt = new Date();
  await record.save();
  return { message: "Email verified" };
}

export async function resendVerification(userId: string, email: string) {
  const raw = randomToken(32);
  await AuthToken.create({
    userId,
    tokenHash: sha256(raw),
    type: "email_verification",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await sendVerificationEmail(email, raw);
  return { message: "Verification email sent" };
}

export async function listSessions(userId: string) {
  const sessions = await Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select("_id userAgent ip createdAt expiresAt")
    .sort({ createdAt: -1 });
  return sessions.map((s) => ({
    id: String(s._id),
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const session = await Session.findOne({ _id: sessionId, userId });
  if (!session) throw unauthorized("NOT_FOUND", "Session not found");
  session.revokedAt = new Date();
  await session.save();
  return { ok: true };
}

/** Exported for tests */
export { safeCompare, publicUser };
