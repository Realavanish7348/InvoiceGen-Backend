import { Expense } from "./expense.model.js";
import {
  PLAN_DEFINITIONS,
  Subscription,
  type PlanId,
} from "../subscriptions/subscription.model.js";
import { assertCompanyOwnership } from "../../utils/ownershipCheck.js";
import { badRequest } from "../../utils/AppError.js";

async function assertExpensesEntitlement(companyId: string) {
  const sub = await Subscription.findOne({ companyId });
  const planId = (sub?.planId ?? "free") as PlanId;
  const plan = PLAN_DEFINITIONS[planId];
  if (!plan.expenses) {
    throw badRequest(
      "Expense tracking requires a Professional or Business plan",
      "PLAN_FEATURE_REQUIRED",
    );
  }
}

export async function listExpenses(params: {
  companyId: string;
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  from?: Date;
  to?: Date;
}) {
  await assertExpensesEntitlement(params.companyId);
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const filter: Record<string, unknown> = {
    companyId: params.companyId,
    isDeleted: false,
  };

  if (params.category) filter.category = params.category;
  if (params.from || params.to) {
    filter.date = {
      ...(params.from ? { $gte: params.from } : {}),
      ...(params.to ? { $lte: params.to } : {}),
    };
  }
  if (params.search) {
    filter.$or = [
      { vendor: { $regex: params.search, $options: "i" } },
      { notes: { $regex: params.search, $options: "i" } },
      { category: { $regex: params.search, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Expense.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

export async function getExpense(companyId: string, id: string) {
  await assertExpensesEntitlement(companyId);
  return assertCompanyOwnership(Expense, id, companyId);
}

export async function createExpense(
  companyId: string,
  createdByUserId: string,
  input: {
    amount: number;
    currency: string;
    category: string;
    date: Date;
    vendor?: string;
    notes?: string;
  },
) {
  await assertExpensesEntitlement(companyId);
  return Expense.create({
    companyId,
    createdByUserId,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    category: input.category.trim(),
    date: input.date,
    vendor: input.vendor?.trim(),
    notes: input.notes?.trim(),
  });
}

export async function updateExpense(
  companyId: string,
  id: string,
  input: Partial<{
    amount: number;
    currency: string;
    category: string;
    date: Date;
    vendor: string;
    notes: string;
  }>,
) {
  await assertExpensesEntitlement(companyId);
  const expense = await assertCompanyOwnership(Expense, id, companyId);
  if (input.amount !== undefined) expense.amount = input.amount;
  if (input.currency !== undefined) expense.currency = input.currency.toUpperCase();
  if (input.category !== undefined) expense.category = input.category.trim();
  if (input.date !== undefined) expense.date = input.date;
  if (input.vendor !== undefined) expense.vendor = input.vendor.trim();
  if (input.notes !== undefined) expense.notes = input.notes.trim();
  await expense.save();
  return expense;
}

export async function deleteExpense(companyId: string, id: string) {
  await assertExpensesEntitlement(companyId);
  const expense = await assertCompanyOwnership(Expense, id, companyId);
  expense.isDeleted = true;
  expense.deletedAt = new Date();
  await expense.save();
  return { id: String(expense._id), deleted: true };
}

export async function updateReceiptUrl(
  companyId: string,
  id: string,
  receiptUrl: string,
) {
  await assertExpensesEntitlement(companyId);
  const expense = await assertCompanyOwnership(Expense, id, companyId);
  expense.receiptUrl = receiptUrl;
  await expense.save();
  return expense;
}
