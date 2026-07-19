import { Types } from "mongoose";
import { Invoice } from "../invoices/invoice.model.js";
import { Client } from "../clients/client.model.js";
import { Product } from "../products/product.model.js";

export type DashboardRange = "7d" | "30d" | "90d" | "12m";

function toObjectId(companyId: string) {
  return new Types.ObjectId(companyId);
}

export async function getSummary(companyId: string) {
  const companyObjectId = toObjectId(companyId);

  const [statusCounts, revenueAgg, clientsCount, productsCount] = await Promise.all([
    Invoice.aggregate<{ _id: string; count: number }>([
      { $match: { companyId: companyObjectId, isDeleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Invoice.aggregate<{ _id: null; revenue: number }>([
      {
        $match: {
          companyId: companyObjectId,
          isDeleted: false,
          status: "paid",
        },
      },
      { $group: { _id: null, revenue: { $sum: "$grandTotal" } } },
    ]),
    Client.countDocuments({ companyId, isDeleted: false }),
    Product.countDocuments({ companyId, isDeleted: false }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusCounts) counts[row._id] = row.count;
  const totalInvoices = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return {
    totalInvoices,
    draft: counts.draft ?? 0,
    published: counts.published ?? 0,
    pending: counts.pending ?? 0,
    paid: counts.paid ?? 0,
    overdue: counts.overdue ?? 0,
    archived: counts.archived ?? 0,
    revenue: revenueAgg[0]?.revenue ?? 0,
    clients: clientsCount,
    products: productsCount,
  };
}

type RangeConfig = { start: Date; dateFormat: string };

function resolveRange(range: DashboardRange, now: Date = new Date()): RangeConfig {
  switch (range) {
    case "7d":
      return { start: new Date(now.getTime() - 7 * 86_400_000), dateFormat: "%Y-%m-%d" };
    case "30d":
      return { start: new Date(now.getTime() - 30 * 86_400_000), dateFormat: "%Y-%m-%d" };
    case "90d":
      return { start: new Date(now.getTime() - 90 * 86_400_000), dateFormat: "%Y-%m-%d" };
    case "12m":
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 11, 1),
        dateFormat: "%Y-%m",
      };
  }
}

async function getRevenueSeries(companyId: string, range: DashboardRange) {
  const { start, dateFormat } = resolveRange(range);
  const rows = await Invoice.aggregate<{ _id: string; revenue: number }>([
    {
      $match: {
        companyId: toObjectId(companyId),
        isDeleted: false,
        status: "paid",
        issueDate: { $gte: start },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: "$issueDate" } },
        revenue: { $sum: "$grandTotal" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((row) => ({ period: row._id, revenue: row.revenue }));
}

async function getInvoiceCountSeries(companyId: string, range: DashboardRange) {
  const { start, dateFormat } = resolveRange(range);
  const rows = await Invoice.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        companyId: toObjectId(companyId),
        isDeleted: false,
        issueDate: { $gte: start },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: "$issueDate" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((row) => ({ period: row._id, count: row.count }));
}

async function getStatusBreakdown(companyId: string) {
  const rows = await Invoice.aggregate<{ _id: string; count: number }>([
    { $match: { companyId: toObjectId(companyId), isDeleted: false } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return rows.map((row) => ({ status: row._id, count: row.count }));
}

export async function getCharts(companyId: string, range: DashboardRange) {
  const [revenueOverTime, monthlyInvoiceCount, invoiceStatusBreakdown, monthlyEarnings] =
    await Promise.all([
      getRevenueSeries(companyId, range),
      getInvoiceCountSeries(companyId, range),
      getStatusBreakdown(companyId),
      getRevenueSeries(companyId, "12m"),
    ]);

  return {
    revenueOverTime,
    monthlyInvoiceCount,
    invoiceStatusBreakdown,
    monthlyEarnings,
  };
}

export async function getRecentActivity(companyId: string, limit = 10) {
  const selectFields =
    "invoiceNumber status currency grandTotal clientSnapshot createdAt updatedAt paidAt";

  const [recentlyCreated, recentlyUpdated, recentPayments] = await Promise.all([
    Invoice.find({ companyId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(selectFields),
    Invoice.find({ companyId, isDeleted: false })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select(selectFields),
    Invoice.find({ companyId, isDeleted: false, status: "paid" })
      .sort({ paidAt: -1 })
      .limit(limit)
      .select(selectFields),
  ]);

  return { recentlyCreated, recentlyUpdated, recentPayments };
}
