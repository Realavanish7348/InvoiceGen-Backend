import mongoose from "mongoose";
import { Invoice } from "./invoice.model.js";
import { Client } from "../clients/client.model.js";
import { Company } from "../companies/company.model.js";
import { TaxRule } from "../taxRules/taxRule.model.js";
import { Settings } from "../settings/settings.model.js";
import { Subscription, PLAN_DEFINITIONS } from "../subscriptions/subscription.model.js";
import { calculateInvoiceTotals } from "../../utils/money.js";
import { assertCompanyOwnership } from "../../utils/ownershipCheck.js";
import { buildSearchRegex } from "../../utils/pagination.js";
import { badRequest, conflict, notFound } from "../../utils/AppError.js";
import { createNotification } from "../../services/notification.service.js";
import { generateInvoicePdf } from "../../services/pdf.service.js";

async function nextInvoiceNumber(companyId: string, session?: mongoose.ClientSession) {
  const settings = await Settings.findOneAndUpdate(
    { companyId },
    { $inc: { nextInvoiceNumber: 1 } },
    { returnDocument: "before", upsert: true, session },
  );
  const n = settings?.nextInvoiceNumber ?? 1;
  const prefix = settings?.invoicePrefix ?? "INV-";
  return `${prefix}${String(n).padStart(5, "0")}`;
}

async function assertInvoiceQuota(companyId: string) {
  const sub = await Subscription.findOne({ companyId });
  const planId = (sub?.planId ?? "free") as keyof typeof PLAN_DEFINITIONS;
  const plan = PLAN_DEFINITIONS[planId];
  if (plan.invoicesPerMonth == null) return;

  const start = sub?.currentPeriodStart ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const count = await Invoice.countDocuments({
    companyId,
    createdAt: { $gte: start },
    isDeleted: false,
  });
  if (count >= plan.invoicesPerMonth) {
    throw badRequest("Monthly invoice limit reached", "PLAN_LIMIT_EXCEEDED");
  }
}

async function buildTotals(
  companyId: string,
  input: {
    items: Array<{ quantity: number; unitPrice: number; name: string; description?: string; productId?: string; serviceId?: string }>;
    discountAmount?: number;
    shippingAmount?: number;
    taxRuleId?: string;
  },
) {
  let taxRateBps = 0;
  if (input.taxRuleId) {
    const rule = await TaxRule.findOne({
      _id: input.taxRuleId,
      companyId,
      isDeleted: false,
    });
    if (!rule) throw badRequest("Invalid tax rule");
    taxRateBps = rule.rateBps;
  }

  const totals = calculateInvoiceTotals({
    lines: input.items.map((i) => ({
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    discountAmount: input.discountAmount ?? 0,
    taxRateBps,
    shippingAmount: input.shippingAmount ?? 0,
  });

  const items = input.items.map((i) => ({
    ...i,
    amount: Math.round(i.quantity * i.unitPrice),
  }));

  return { ...totals, taxRateBps, items };
}

export async function listInvoices(
  companyId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    clientId?: string;
    currency?: string;
    from?: Date;
    to?: Date;
    includeDeleted?: boolean;
  },
) {
  const filter: Record<string, unknown> = { companyId };
  if (!query.includeDeleted) filter.isDeleted = false;
  else filter.isDeleted = true;

  if (query.status) filter.status = query.status;
  if (query.clientId) filter.clientId = query.clientId;
  if (query.currency) filter.currency = query.currency.toUpperCase();
  if (query.from || query.to) {
    filter.issueDate = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.search) {
    const regex = buildSearchRegex(query.search);
    filter.$or = [
      { invoiceNumber: regex },
      { "clientSnapshot.name": regex },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [total, data] = await Promise.all([
    Invoice.countDocuments(filter),
    Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
  ]);

  return { data, total, page: query.page, limit: query.limit };
}

export async function getInvoice(companyId: string, id: string) {
  return assertCompanyOwnership(Invoice, id, companyId, {
    includeDeleted: true,
  });
}

export async function createInvoice(
  companyId: string,
  userId: string,
  input: {
    clientId: string;
    templateId?: string;
    currency: string;
    issueDate: Date;
    dueDate: Date;
    items: Array<{
      name: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      productId?: string;
      serviceId?: string;
    }>;
    discountAmount?: number;
    taxRuleId?: string;
    shippingAmount?: number;
    notes?: string;
    terms?: string;
    paymentInstructions?: string;
    footer?: string;
  },
) {
  await assertInvoiceQuota(companyId);

  const client = await Client.findOne({
    _id: input.clientId,
    companyId,
    isDeleted: false,
  });
  if (!client) throw badRequest("Invalid client");

  const company = await Company.findById(companyId);
  if (!company) throw notFound("Company not found");

  const totals = await buildTotals(companyId, input);
  const invoiceNumber = await nextInvoiceNumber(companyId);

  try {
    const invoice = await Invoice.create({
      companyId,
      clientId: client._id,
      templateId: input.templateId,
      invoiceNumber,
      status: "draft",
      currency: input.currency.toUpperCase(),
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      items: totals.items,
      discountAmount: totals.discountAmount,
      taxRuleId: input.taxRuleId,
      taxRateBps: totals.taxRateBps,
      shippingAmount: totals.shippingAmount,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
      notes: input.notes,
      terms: input.terms,
      paymentInstructions: input.paymentInstructions,
      footer: input.footer,
      clientSnapshot: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        company: client.company,
        address: client.address,
      },
      companySnapshot: {
        name: company.name,
        email: company.email,
        phone: company.phone,
        taxNumber: company.taxNumber,
        logoUrl: company.logoUrl,
        address: company.address,
      },
      createdByUserId: userId,
    });

    await createNotification({
      companyId,
      userId,
      type: "invoice_created",
      title: "Invoice created",
      message: `Draft ${invoice.invoiceNumber} was created`,
      resourceType: "invoice",
      resourceId: String(invoice._id),
    });

    return invoice;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    ) {
      throw conflict("Invoice number conflict");
    }
    throw err;
  }
}

export async function updateInvoice(
  companyId: string,
  id: string,
  input: Partial<{
    clientId: string;
    templateId: string;
    currency: string;
    issueDate: Date;
    dueDate: Date;
    items: Array<{
      name: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      productId?: string;
      serviceId?: string;
    }>;
    discountAmount: number;
    taxRuleId: string;
    shippingAmount: number;
    notes: string;
    terms: string;
    paymentInstructions: string;
    footer: string;
  }>,
) {
  const invoice = await assertCompanyOwnership(Invoice, id, companyId);

  if (invoice.status !== "draft") {
    // Non-draft: only non-financial notes fields
    const allowed = ["notes", "terms", "paymentInstructions", "footer"] as const;
    for (const key of Object.keys(input)) {
      if (!allowed.includes(key as (typeof allowed)[number])) {
        throw badRequest("Published invoices cannot change financial fields");
      }
    }
    for (const key of allowed) {
      if (input[key] !== undefined) {
        invoice[key] = input[key];
      }
    }
    await invoice.save();
    return invoice;
  }

  if (input.clientId) {
    const client = await Client.findOne({
      _id: input.clientId,
      companyId,
      isDeleted: false,
    });
    if (!client) throw badRequest("Invalid client");
    invoice.clientId = client._id;
    invoice.clientSnapshot = {
      name: client.name,
      email: client.email,
      phone: client.phone,
      company: client.company,
      address: client.address,
    };
  }

  if (input.items) {
    const totals = await buildTotals(companyId, {
      items: input.items,
      discountAmount: input.discountAmount ?? invoice.discountAmount,
      shippingAmount: input.shippingAmount ?? invoice.shippingAmount,
      taxRuleId: input.taxRuleId ?? (invoice.taxRuleId ? String(invoice.taxRuleId) : undefined),
    });
    invoice.items = totals.items as typeof invoice.items;
    invoice.subtotal = totals.subtotal;
    invoice.discountAmount = totals.discountAmount;
    invoice.taxAmount = totals.taxAmount;
    invoice.shippingAmount = totals.shippingAmount;
    invoice.grandTotal = totals.grandTotal;
    invoice.taxRateBps = totals.taxRateBps;
    if (input.taxRuleId !== undefined) invoice.taxRuleId = input.taxRuleId as unknown as typeof invoice.taxRuleId;
  } else if (
    input.discountAmount !== undefined ||
    input.shippingAmount !== undefined ||
    input.taxRuleId !== undefined
  ) {
    const totals = await buildTotals(companyId, {
      items: invoice.items.map((i) => ({
        name: i.name,
        description: i.description ?? undefined,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      discountAmount: input.discountAmount ?? invoice.discountAmount,
      shippingAmount: input.shippingAmount ?? invoice.shippingAmount,
      taxRuleId: input.taxRuleId ?? (invoice.taxRuleId ? String(invoice.taxRuleId) : undefined),
    });
    invoice.subtotal = totals.subtotal;
    invoice.discountAmount = totals.discountAmount;
    invoice.taxAmount = totals.taxAmount;
    invoice.shippingAmount = totals.shippingAmount;
    invoice.grandTotal = totals.grandTotal;
    invoice.taxRateBps = totals.taxRateBps;
  }

  if (input.currency) invoice.currency = input.currency.toUpperCase();
  if (input.issueDate) invoice.issueDate = input.issueDate;
  if (input.dueDate) invoice.dueDate = input.dueDate;
  if (input.templateId !== undefined) invoice.templateId = input.templateId as unknown as typeof invoice.templateId;
  if (input.notes !== undefined) invoice.notes = input.notes;
  if (input.terms !== undefined) invoice.terms = input.terms;
  if (input.paymentInstructions !== undefined) {
    invoice.paymentInstructions = input.paymentInstructions;
  }
  if (input.footer !== undefined) invoice.footer = input.footer;

  await invoice.save();
  return invoice;
}

export async function publishInvoice(
  companyId: string,
  userId: string,
  id: string,
) {
  const invoice = await assertCompanyOwnership(Invoice, id, companyId);
  if (invoice.status !== "draft") {
    throw badRequest("Only drafts can be published");
  }
  invoice.status = "published";
  invoice.publishedAt = new Date();
  await invoice.save();

  await createNotification({
    companyId,
    userId,
    type: "invoice_published",
    title: "Invoice published",
    message: `${invoice.invoiceNumber} was published`,
    resourceType: "invoice",
    resourceId: String(invoice._id),
  });

  return invoice;
}

export async function changeStatus(
  companyId: string,
  userId: string,
  id: string,
  status: "pending" | "paid" | "archived",
) {
  const invoice = await assertCompanyOwnership(Invoice, id, companyId);

  const transitions: Record<string, string[]> = {
    published: ["pending", "paid", "archived"],
    pending: ["paid", "archived"],
    paid: ["archived"],
    overdue: ["paid", "archived"],
    archived: [],
    draft: [],
  };

  const allowed = transitions[invoice.status] ?? [];
  if (!allowed.includes(status)) {
    throw badRequest(`Cannot transition from ${invoice.status} to ${status}`);
  }

  invoice.status = status;
  if (status === "paid") {
    invoice.paidAt = new Date();
    await createNotification({
      companyId,
      userId,
      type: "invoice_paid",
      title: "Invoice paid",
      message: `${invoice.invoiceNumber} marked as paid`,
      resourceType: "invoice",
      resourceId: String(invoice._id),
    });
  }
  await invoice.save();
  return invoice;
}

export async function duplicateInvoice(
  companyId: string,
  userId: string,
  id: string,
) {
  const source = await assertCompanyOwnership(Invoice, id, companyId);
  await assertInvoiceQuota(companyId);
  const invoiceNumber = await nextInvoiceNumber(companyId);

  const clone = await Invoice.create({
    companyId,
    clientId: source.clientId,
    templateId: source.templateId,
    invoiceNumber,
    status: "draft",
    currency: source.currency,
    issueDate: new Date(),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    items: source.items,
    discountAmount: source.discountAmount,
    taxRuleId: source.taxRuleId,
    taxRateBps: source.taxRateBps,
    shippingAmount: source.shippingAmount,
    subtotal: source.subtotal,
    taxAmount: source.taxAmount,
    grandTotal: source.grandTotal,
    notes: source.notes,
    terms: source.terms,
    paymentInstructions: source.paymentInstructions,
    footer: source.footer,
    clientSnapshot: source.clientSnapshot,
    companySnapshot: source.companySnapshot,
    createdByUserId: userId,
  });

  return clone;
}

export async function softDeleteInvoice(companyId: string, id: string) {
  const invoice = await assertCompanyOwnership(Invoice, id, companyId);
  invoice.isDeleted = true;
  invoice.deletedAt = new Date();
  await invoice.save();
  return { message: "Invoice moved to trash" };
}

export async function restoreInvoice(companyId: string, id: string) {
  const invoice = await assertCompanyOwnership(Invoice, id, companyId, {
    includeDeleted: true,
  });
  if (!invoice.isDeleted) throw badRequest("Invoice is not in trash");
  invoice.isDeleted = false;
  invoice.deletedAt = null;
  await invoice.save();
  return invoice;
}

export async function pdfForInvoice(companyId: string, id: string) {
  const invoice = await assertCompanyOwnership(Invoice, id, companyId);
  const company = await Company.findById(companyId);
  const sub = await Subscription.findOne({ companyId });
  const plan = PLAN_DEFINITIONS[(sub?.planId ?? "free") as keyof typeof PLAN_DEFINITIONS];
  const buffer = await generateInvoicePdf(invoice, company, {
    watermark: !plan.removeBranding,
  });
  return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
}
