import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

export const PLAN_DEFINITIONS = {
  free: {
    id: "free",
    name: "Free",
    invoicesPerMonth: 5,
    removeBranding: false,
    premiumTemplates: false,
    analytics: false,
    onlinePayments: false,
    expenses: false,
    reports: false,
    aiInvoices: false,
    ocrReceipts: false,
    aiInsights: false,
  },
  professional: {
    id: "professional",
    name: "Professional",
    invoicesPerMonth: null as number | null,
    removeBranding: true,
    premiumTemplates: true,
    analytics: false,
    onlinePayments: true,
    expenses: true,
    reports: false,
    aiInvoices: true,
    ocrReceipts: true,
    aiInsights: false,
  },
  business: {
    id: "business",
    name: "Business",
    invoicesPerMonth: null as number | null,
    removeBranding: true,
    premiumTemplates: true,
    analytics: true,
    onlinePayments: true,
    expenses: true,
    reports: true,
    aiInvoices: true,
    ocrReceipts: true,
    aiInsights: true,
  },
} as const;

export type PlanId = keyof typeof PLAN_DEFINITIONS;

const subscriptionSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
      index: true,
    },
    planId: {
      type: String,
      enum: ["free", "professional", "business"],
      default: "free",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "canceled"],
      default: "active",
    },
    currentPeriodStart: { type: Date, default: () => new Date() },
    currentPeriodEnd: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    history: [
      {
        planId: String,
        changedAt: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  { timestamps: true },
);

export type SubscriptionDocument = HydratedDocument<
  InferSchemaType<typeof subscriptionSchema>
>;

export const Subscription = model("Subscription", subscriptionSchema);
