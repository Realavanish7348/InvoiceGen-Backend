import {
  PLAN_DEFINITIONS,
  Subscription,
  type PlanId,
} from "../subscriptions/subscription.model.js";
import { badRequest } from "../../utils/AppError.js";
import { env } from "../../config/env.js";

export async function getPlanForCompany(companyId: string) {
  const sub = await Subscription.findOne({ companyId });
  const planId = (sub?.planId ?? "free") as PlanId;
  return PLAN_DEFINITIONS[planId];
}

export async function assertAiInvoicesEntitlement(companyId: string) {
  const plan = await getPlanForCompany(companyId);
  if (!plan.aiInvoices) {
    throw badRequest(
      "AI invoice generation requires a Professional or Business plan",
      "PLAN_FEATURE_REQUIRED",
    );
  }
}

export async function assertOcrReceiptsEntitlement(companyId: string) {
  const plan = await getPlanForCompany(companyId);
  if (!plan.expenses || !plan.ocrReceipts) {
    throw badRequest(
      "OCR receipt scanning requires a Professional or Business plan with expenses",
      "PLAN_FEATURE_REQUIRED",
    );
  }
}

export async function assertAiInsightsEntitlement(companyId: string) {
  const plan = await getPlanForCompany(companyId);
  if (!plan.aiInsights || !plan.reports) {
    throw badRequest(
      "AI financial insights require a Business plan",
      "PLAN_FEATURE_REQUIRED",
    );
  }
}

/** In-memory daily AI call counter per company (resets on process restart). */
const dailyCounts = new Map<string, { day: string; count: number }>();

/** Test helper — override effective daily cap (null restores env default). */
let dailyCapOverride: number | null = null;

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function effectiveDailyCap(): number {
  return dailyCapOverride ?? env.AI_DAILY_REQUEST_CAP;
}

export function assertAiDailyCap(companyId: string): void {
  const day = utcDayKey();
  const entry = dailyCounts.get(companyId);
  const cap = effectiveDailyCap();
  if (!entry || entry.day !== day) {
    dailyCounts.set(companyId, { day, count: 1 });
    return;
  }
  if (entry.count >= cap) {
    throw badRequest(
      "Daily AI request limit reached for this workspace. Try again tomorrow.",
      "AI_DAILY_LIMIT_EXCEEDED",
    );
  }
  entry.count += 1;
}

/** Test helper */
export function resetAiDailyCaps(): void {
  dailyCounts.clear();
  dailyCapOverride = null;
}

export function setAiDailyCapForTests(cap: number | null): void {
  dailyCapOverride = cap;
}

/** Test helper — how many calls counted today for a company (0 if none). */
export function getAiDailyCountForTests(companyId: string): number {
  const day = utcDayKey();
  const entry = dailyCounts.get(companyId);
  if (!entry || entry.day !== day) return 0;
  return entry.count;
}
