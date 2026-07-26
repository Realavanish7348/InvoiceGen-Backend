import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { Client } from "../clients/client.model.js";
import { Company } from "../companies/company.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import {
  PLAN_DEFINITIONS,
  Subscription,
  type PlanId,
} from "../subscriptions/subscription.model.js";
import { generateInvoicePdf } from "../../services/pdf.service.js";
import { sendPortalMagicLinkEmail } from "../../services/email.service.js";
import {
  signPortalAccessToken,
  signPortalRefreshToken,
  verifyPortalRefreshToken,
} from "../../utils/jwt.js";
import { randomToken, sha256 } from "../../utils/tokenCompare.js";
import { badRequest, notFound, unauthorized } from "../../utils/AppError.js";
import {
  createCheckoutSessionForInvoice,
  isInvoicePayableStatus,
} from "../payments/payment.service.js";
import { PortalAuthToken } from "./portalAuthToken.model.js";
import { PortalSession } from "./portalSession.model.js";

const BCRYPT_COST = 12;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const REFRESH_COOKIE = "portalRefreshToken";
const PORTAL_VISIBLE_STATUSES = [
  "published",
  "pending",
  "paid",
  "overdue",
  "archived",
] as const;

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/v1/portal",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setPortalRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

export function clearPortalRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/portal",
  });
}

async function issuePortalTokens(
  email: string,
  req: Request,
  res: Response,
) {
  const normalized = email.toLowerCase().trim();
  const tempSession = await PortalSession.create({
    email: normalized,
    refreshTokenHash: "pending",
    userAgent: req.get("user-agent") ?? undefined,
    ip: req.ip,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const accessToken = signPortalAccessToken(normalized, String(tempSession._id));
  const refreshToken = signPortalRefreshToken(
    normalized,
    String(tempSession._id),
  );
  tempSession.refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_COST);
  await tempSession.save();
  setPortalRefreshCookie(res, refreshToken);

  return {
    accessToken,
    sessionId: String(tempSession._id),
    email: normalized,
  };
}

/**
 * Always returns the same success shape (no email enumeration).
 * Sends a magic link only when at least one non-deleted Client has that email.
 */
export async function requestMagicLink(email: string) {
  const normalized = email.toLowerCase().trim();
  const clientExists = await Client.exists({
    email: normalized,
    isDeleted: false,
  });

  if (clientExists) {
    const raw = randomToken(32);
    await PortalAuthToken.create({
      email: normalized,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    });
    await sendPortalMagicLinkEmail(normalized, raw);
  }

  return {
    message:
      "If that email is associated with invoices, a sign-in link has been sent.",
  };
}

export async function verifyMagicLink(
  input: { email: string; token: string },
  req: Request,
  res: Response,
) {
  const email = input.email.toLowerCase().trim();
  const record = await PortalAuthToken.findOne({
    email,
    tokenHash: sha256(input.token),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    throw unauthorized("TOKEN_INVALID", "Invalid or expired portal link");
  }

  record.usedAt = new Date();
  await record.save();

  const tokens = await issuePortalTokens(email, req, res);
  return {
    accessToken: tokens.accessToken,
    email: tokens.email,
  };
}

export async function refreshPortalSession(req: Request, res: Response) {
  const cookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!cookie) {
    throw unauthorized("UNAUTHORIZED", "Portal refresh token required");
  }

  let payload;
  try {
    payload = verifyPortalRefreshToken(cookie);
  } catch {
    clearPortalRefreshCookie(res);
    throw unauthorized("TOKEN_INVALID", "Invalid or expired portal refresh token");
  }

  const session = await PortalSession.findOne({
    _id: payload.sid,
    email: payload.sub,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    clearPortalRefreshCookie(res);
    throw unauthorized("TOKEN_INVALID", "Invalid or expired portal session");
  }

  const matches = await bcrypt.compare(cookie, session.refreshTokenHash);
  if (!matches) {
    await PortalSession.updateMany(
      { email: payload.sub, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    clearPortalRefreshCookie(res);
    throw unauthorized("TOKEN_REUSED", "Portal session revoked");
  }

  session.revokedAt = new Date();
  await session.save();

  const tokens = await issuePortalTokens(payload.sub, req, res);
  session.replacedBySessionId = new mongoose.Types.ObjectId(tokens.sessionId);
  await session.save();

  return { accessToken: tokens.accessToken, email: tokens.email };
}

export async function logoutPortal(req: Request, res: Response) {
  const cookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (cookie) {
    try {
      const payload = verifyPortalRefreshToken(cookie);
      await PortalSession.updateOne(
        { _id: payload.sid, email: payload.sub },
        { $set: { revokedAt: new Date() } },
      );
    } catch {
      // clear cookie anyway
    }
  }
  if (req.portal?.sessionId) {
    await PortalSession.updateOne(
      { _id: req.portal.sessionId },
      { $set: { revokedAt: new Date() } },
    );
  }
  clearPortalRefreshCookie(res);
  return { message: "Logged out" };
}

export async function getPortalMe(email: string) {
  return { email };
}

async function clientIdsForEmail(email: string) {
  const clients = await Client.find({
    email: email.toLowerCase().trim(),
    isDeleted: false,
  })
    .select("_id")
    .lean();
  return clients.map((c) => c._id);
}

function toPortalInvoice(invoice: {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;
  status: string;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  items: unknown[];
  discountAmount?: number | null;
  taxRateBps?: number | null;
  shippingAmount?: number | null;
  subtotal?: number | null;
  taxAmount?: number | null;
  grandTotal?: number | null;
  notes?: string | null;
  terms?: string | null;
  paymentInstructions?: string | null;
  footer?: string | null;
  clientSnapshot?: unknown;
  companySnapshot?: unknown;
  publishedAt?: Date | null;
  paidAt?: Date | null;
}) {
  return {
    id: String(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    items: invoice.items,
    discountAmount: invoice.discountAmount ?? 0,
    taxRateBps: invoice.taxRateBps ?? 0,
    shippingAmount: invoice.shippingAmount ?? 0,
    subtotal: invoice.subtotal ?? 0,
    taxAmount: invoice.taxAmount ?? 0,
    grandTotal: invoice.grandTotal ?? 0,
    notes: invoice.notes ?? null,
    terms: invoice.terms ?? null,
    paymentInstructions: invoice.paymentInstructions ?? null,
    footer: invoice.footer ?? null,
    clientSnapshot: invoice.clientSnapshot ?? null,
    companySnapshot: invoice.companySnapshot ?? null,
    publishedAt: invoice.publishedAt ?? null,
    paidAt: invoice.paidAt ?? null,
    payable: isInvoicePayableStatus(invoice.status),
  };
}

export async function listPortalInvoices(params: {
  email: string;
  page?: number;
  limit?: number;
  status?: string;
}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const clientIds = await clientIdsForEmail(params.email);
  if (clientIds.length === 0) {
    return { items: [], total: 0, page, limit };
  }

  const filter: Record<string, unknown> = {
    clientId: { $in: clientIds },
    isDeleted: false,
    status: params.status
      ? params.status
      : { $in: [...PORTAL_VISIBLE_STATUSES] },
  };

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ issueDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  return {
    items: items.map((inv) => toPortalInvoice(inv as never)),
    total,
    page,
    limit,
  };
}

async function findPortalInvoiceOr404(email: string, invoiceId: string) {
  if (!mongoose.isValidObjectId(invoiceId)) {
    throw notFound();
  }
  const clientIds = await clientIdsForEmail(email);
  if (clientIds.length === 0) throw notFound();

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    clientId: { $in: clientIds },
    isDeleted: false,
    status: { $in: [...PORTAL_VISIBLE_STATUSES] },
  });

  if (!invoice) throw notFound();
  return invoice;
}

export async function getPortalInvoice(email: string, invoiceId: string) {
  const invoice = await findPortalInvoiceOr404(email, invoiceId);
  return toPortalInvoice(invoice);
}

export async function pdfForPortalInvoice(email: string, invoiceId: string) {
  const invoice = await findPortalInvoiceOr404(email, invoiceId);
  const company = await Company.findById(invoice.companyId);
  const sub = await Subscription.findOne({ companyId: invoice.companyId });
  const plan =
    PLAN_DEFINITIONS[(sub?.planId ?? "free") as PlanId] ?? PLAN_DEFINITIONS.free;
  const buffer = await generateInvoicePdf(invoice, company, {
    watermark: !plan.removeBranding,
  });
  return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
}

export async function createPortalCheckoutSession(
  email: string,
  invoiceId: string,
) {
  const invoice = await findPortalInvoiceOr404(email, invoiceId);
  return createCheckoutSessionForInvoice({
    companyId: String(invoice.companyId),
    invoiceId: String(invoice._id),
    successPath: `/portal/invoices/${invoice._id}?payment=success`,
    cancelPath: `/portal/invoices/${invoice._id}?payment=canceled`,
    createdByUserId: undefined,
  });
}
