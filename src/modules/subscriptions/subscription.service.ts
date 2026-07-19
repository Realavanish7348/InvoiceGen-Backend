import {
  Subscription,
  PLAN_DEFINITIONS,
  type PlanId,
  type SubscriptionDocument,
} from "./subscription.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import { createNotification } from "../../services/notification.service.js";
import { badRequest } from "../../utils/AppError.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function listPlans() {
  return Object.values(PLAN_DEFINITIONS);
}

export async function getOrCreateSubscription(
  companyId: string,
): Promise<SubscriptionDocument> {
  let subscription = await Subscription.findOne({ companyId });
  if (!subscription) {
    subscription = await Subscription.create({ companyId });
  }
  return subscription;
}

export function serializeSubscription(subscription: SubscriptionDocument) {
  const planId = subscription.planId as PlanId;
  return {
    id: String(subscription._id),
    companyId: String(subscription.companyId),
    planId,
    plan: PLAN_DEFINITIONS[planId],
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    history: subscription.history ?? [],
  };
}

export async function getCurrentSubscription(companyId: string) {
  const subscription = await getOrCreateSubscription(companyId);
  return serializeSubscription(subscription);
}

export async function changePlan(
  companyId: string,
  userId: string,
  planId: string,
  note?: string,
) {
  if (!Object.prototype.hasOwnProperty.call(PLAN_DEFINITIONS, planId)) {
    throw badRequest("Unknown plan", "INVALID_PLAN");
  }
  const typedPlanId = planId as PlanId;
  const subscription = await getOrCreateSubscription(companyId);

  if (subscription.planId === typedPlanId) {
    return serializeSubscription(subscription);
  }

  const now = new Date();
  subscription.history = subscription.history ?? [];
  subscription.history.push({ planId: typedPlanId, changedAt: now, note });
  subscription.planId = typedPlanId;
  subscription.status = "active";
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = new Date(now.getTime() + THIRTY_DAYS_MS);
  await subscription.save();

  await createNotification({
    companyId,
    userId,
    type: "system",
    title: "Subscription updated",
    message: `Your plan has been changed to ${PLAN_DEFINITIONS[typedPlanId].name}.`,
    resourceType: "subscription",
    resourceId: subscription._id,
  });

  return serializeSubscription(subscription);
}

export async function getUsage(companyId: string) {
  const subscription = await getOrCreateSubscription(companyId);
  const plan = PLAN_DEFINITIONS[subscription.planId as PlanId];

  const invoicesUsed = await Invoice.countDocuments({
    companyId,
    isDeleted: false,
    createdAt: {
      $gte: subscription.currentPeriodStart,
      $lte: subscription.currentPeriodEnd,
    },
  });

  const invoicesLimit = plan.invoicesPerMonth;
  const invoicesRemaining =
    invoicesLimit === null ? null : Math.max(invoicesLimit - invoicesUsed, 0);

  return {
    planId: subscription.planId,
    planName: plan.name,
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    invoicesUsed,
    invoicesLimit,
    invoicesRemaining,
  };
}
