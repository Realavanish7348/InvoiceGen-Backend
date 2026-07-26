import { Types } from "mongoose";
import { Invoice } from "../invoices/invoice.model.js";
import { Expense } from "../expenses/expense.model.js";
import {
  PLAN_DEFINITIONS,
  Subscription,
  type PlanId,
} from "../subscriptions/subscription.model.js";
import { badRequest } from "../../utils/AppError.js";

async function assertReportsEntitlement(companyId: string) {
  const sub = await Subscription.findOne({ companyId });
  const planId = (sub?.planId ?? "free") as PlanId;
  const plan = PLAN_DEFINITIONS[planId];
  if (!plan.reports) {
    throw badRequest(
      "Reports require a Business plan",
      "PLAN_FEATURE_REQUIRED",
    );
  }
}

function toObjectId(companyId: string) {
  return new Types.ObjectId(companyId);
}

export async function getReportSummary(
  companyId: string,
  from: Date,
  to: Date,
) {
  await assertReportsEntitlement(companyId);

  if (from > to) {
    throw badRequest("`from` must be on or before `to`", "INVALID_REQUEST");
  }

  const companyObjectId = toObjectId(companyId);
  const dateRange = { $gte: from, $lte: to };

  const [
    revenueAgg,
    outstandingAgg,
    invoiceStatus,
    expenseAgg,
    revenueSeries,
    expenseSeries,
  ] = await Promise.all([
    Invoice.aggregate<{ _id: null; revenue: number; count: number }>([
      {
        $match: {
          companyId: companyObjectId,
          isDeleted: false,
          status: "paid",
          paidAt: dateRange,
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$grandTotal" },
          count: { $sum: 1 },
        },
      },
    ]),
    Invoice.aggregate<{ _id: null; outstanding: number; count: number }>([
      {
        $match: {
          companyId: companyObjectId,
          isDeleted: false,
          status: { $in: ["published", "pending", "overdue"] },
        },
      },
      {
        $group: {
          _id: null,
          outstanding: { $sum: "$grandTotal" },
          count: { $sum: 1 },
        },
      },
    ]),
    Invoice.aggregate<{ _id: string; count: number; total: number }>([
      {
        $match: {
          companyId: companyObjectId,
          isDeleted: false,
          issueDate: dateRange,
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total: { $sum: "$grandTotal" },
        },
      },
    ]),
    Expense.aggregate<{ _id: null; expenses: number; count: number }>([
      {
        $match: {
          companyId: companyObjectId,
          isDeleted: false,
          date: dateRange,
        },
      },
      {
        $group: {
          _id: null,
          expenses: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    Invoice.aggregate<{ _id: string; revenue: number }>([
      {
        $match: {
          companyId: companyObjectId,
          isDeleted: false,
          status: "paid",
          paidAt: dateRange,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
          revenue: { $sum: "$grandTotal" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Expense.aggregate<{ _id: string; expenses: number }>([
      {
        $match: {
          companyId: companyObjectId,
          isDeleted: false,
          date: dateRange,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          expenses: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const revenue = revenueAgg[0]?.revenue ?? 0;
  const expenses = expenseAgg[0]?.expenses ?? 0;

  return {
    from,
    to,
    revenue,
    paidInvoiceCount: revenueAgg[0]?.count ?? 0,
    outstanding: outstandingAgg[0]?.outstanding ?? 0,
    outstandingCount: outstandingAgg[0]?.count ?? 0,
    expenses,
    expenseCount: expenseAgg[0]?.count ?? 0,
    net: revenue - expenses,
    invoiceStatusBreakdown: invoiceStatus.map((row) => ({
      status: row._id,
      count: row.count,
      total: row.total,
    })),
    revenueOverTime: revenueSeries.map((row) => ({
      period: row._id,
      revenue: row.revenue,
    })),
    expensesOverTime: expenseSeries.map((row) => ({
      period: row._id,
      expenses: row.expenses,
    })),
  };
}

export async function getReportCsv(companyId: string, from: Date, to: Date) {
  const summary = await getReportSummary(companyId, from, to);
  const lines = [
    "metric,value",
    `from,${from.toISOString()}`,
    `to,${to.toISOString()}`,
    `revenue_cents,${summary.revenue}`,
    `paid_invoice_count,${summary.paidInvoiceCount}`,
    `outstanding_cents,${summary.outstanding}`,
    `outstanding_count,${summary.outstandingCount}`,
    `expenses_cents,${summary.expenses}`,
    `expense_count,${summary.expenseCount}`,
    `net_cents,${summary.net}`,
  ];
  return lines.join("\n");
}
