import Stripe from "stripe";
import { env } from "../config/env.js";
import { badRequest } from "../utils/AppError.js";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw badRequest(
      "Online payments are not configured. Set STRIPE_SECRET_KEY.",
      "PAYMENTS_NOT_CONFIGURED",
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}
