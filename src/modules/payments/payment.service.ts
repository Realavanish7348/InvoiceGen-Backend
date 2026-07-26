import type Stripe from "stripe";
import QRCode from "qrcode";
import { Payment } from "./payment.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import {
  PLAN_DEFINITIONS,
  Subscription,
  type PlanId,
} from "../subscriptions/subscription.model.js";
import { assertCompanyOwnership } from "../../utils/ownershipCheck.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { env } from "../../config/env.js";
import { getStripe, isStripeConfigured } from "../../services/stripe.client.js";
import { markInvoicePaid } from "../invoices/invoice.service.js";
import { logger } from "../../utils/logger.js";

const PAYABLE_STATUSES = new Set(["published", "pending", "overdue"]);

export function isInvoicePayableStatus(status: string): boolean {
  return PAYABLE_STATUSES.has(status);
}

async function assertOnlinePaymentsEntitlement(companyId: string) {
  const sub = await Subscription.findOne({ companyId });
  const planId = (sub?.planId ?? "free") as PlanId;
  const plan = PLAN_DEFINITIONS[planId];
  if (!plan.onlinePayments) {
    throw badRequest(
      "Online payments require a Professional or Business plan",
      "PLAN_FEATURE_REQUIRED",
    );
  }
}

export async function createCheckoutSession(
  companyId: string,
  userId: string,
  invoiceId: string,
) {
  await assertOnlinePaymentsEntitlement(companyId);

  if (!isStripeConfigured()) {
    throw badRequest(
      "Online payments are not configured. Set STRIPE_SECRET_KEY.",
      "PAYMENTS_NOT_CONFIGURED",
    );
  }

  const invoice = await assertCompanyOwnership(Invoice, invoiceId, companyId);

  if (!PAYABLE_STATUSES.has(invoice.status)) {
    throw badRequest(
      "Only published, pending, or overdue invoices can accept online payment",
      "INVOICE_NOT_PAYABLE",
    );
  }

  if (!invoice.grandTotal || invoice.grandTotal < 50) {
    throw badRequest(
      "Invoice total must be at least 50 cents to charge online",
      "INVALID_REQUEST",
    );
  }

  const stripe = getStripe();
  const successUrl = `${env.CLIENT_URL}/invoices/${invoiceId}?payment=success`;
  const cancelUrl = `${env.CLIENT_URL}/invoices/${invoiceId}?payment=canceled`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(invoice._id),
    metadata: {
      invoiceId: String(invoice._id),
      companyId,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: invoice.grandTotal,
          product_data: {
            name: `Invoice ${invoice.invoiceNumber}`,
            description: invoice.clientSnapshot?.name
              ? `Payment for ${invoice.clientSnapshot.name}`
              : undefined,
          },
        },
      },
    ],
  });

  if (!session.url) {
    throw badRequest("Stripe did not return a checkout URL", "INVALID_REQUEST");
  }

  const payment = await Payment.create({
    companyId,
    invoiceId: invoice._id,
    provider: "stripe",
    status: "pending",
    amount: invoice.grandTotal,
    currency: invoice.currency,
    stripeCheckoutSessionId: session.id,
    createdByUserId: userId,
  });

  invoice.paymentProvider = "stripe";
  invoice.stripeCheckoutSessionId = session.id;
  await invoice.save();

  return {
    url: session.url,
    sessionId: session.id,
    paymentId: String(payment._id),
  };
}

/** Checkout URL + QR data URI for copy/share UX. */
export async function getPaymentLink(
  companyId: string,
  userId: string,
  invoiceId: string,
) {
  const session = await createCheckoutSession(companyId, userId, invoiceId);
  const qrDataUrl = await QRCode.toDataURL(session.url, {
    margin: 1,
    width: 256,
    errorCorrectionLevel: "M",
  });
  return { ...session, qrDataUrl };
}

/**
 * Best-effort payment URL for email templates.
 * Returns null when plan/Stripe/status prevent checkout.
 */
export async function tryCreatePaymentUrl(
  companyId: string,
  userId: string,
  invoiceId: string,
): Promise<string | null> {
  try {
    const session = await createCheckoutSession(companyId, userId, invoiceId);
    return session.url;
  } catch {
    return null;
  }
}

async function completeCheckoutSession(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId ?? session.client_reference_id;
  const companyId = session.metadata?.companyId;

  if (!invoiceId || !companyId) {
    logger.warn("Stripe checkout session missing metadata", {
      sessionId: session.id,
    });
    return;
  }

  const payment = await Payment.findOne({
    stripeCheckoutSessionId: session.id,
  });

  if (payment?.status === "succeeded") {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (payment) {
    payment.status = "succeeded";
    if (paymentIntentId) payment.stripePaymentIntentId = paymentIntentId;
    await payment.save();
  }

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    companyId,
    isDeleted: false,
  });
  if (!invoice) {
    logger.warn("Stripe webhook invoice not found", { invoiceId, companyId });
    return;
  }

  if (invoice.status === "paid") {
    if (paymentIntentId) {
      invoice.stripePaymentIntentId = paymentIntentId;
      await invoice.save();
    }
    return;
  }

  await markInvoicePaid(companyId, String(invoice._id), {
    actorUserId: invoice.createdByUserId
      ? String(invoice.createdByUserId)
      : undefined,
    source: "stripe",
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId,
  });
}

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string | undefined,
) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw badRequest(
      "STRIPE_WEBHOOK_SECRET is not configured",
      "PAYMENTS_NOT_CONFIGURED",
    );
  }
  if (!signature) {
    throw badRequest("Missing Stripe-Signature header", "INVALID_REQUEST");
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid Stripe webhook signature";
    throw badRequest(message, "STRIPE_WEBHOOK_INVALID");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid" || session.status === "complete") {
        await completeCheckoutSession(session);
      }
      break;
    }
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      await completeCheckoutSession(session);
      break;
    }
    default:
      logger.info("Unhandled Stripe event", { type: event.type });
  }

  return { received: true };
}

export function paymentsStatus() {
  return {
    configured: isStripeConfigured(),
    webhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
  };
}

export async function getPaymentForInvoice(companyId: string, invoiceId: string) {
  const invoice = await assertCompanyOwnership(Invoice, invoiceId, companyId);
  if (!invoice) throw notFound();
  const payment = await Payment.findOne({ companyId, invoiceId }).sort({
    createdAt: -1,
  });
  return payment;
}
