import { Client } from "../clients/client.model.js";
import { Product } from "../products/product.model.js";
import { Service } from "../services/service.model.js";
import { getReportSummary } from "../reports/report.service.js";
import { env } from "../../config/env.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import {
  assertAiDailyCap,
  assertAiInsightsEntitlement,
  assertAiInvoicesEntitlement,
  assertOcrReceiptsEntitlement,
} from "./ai.entitlements.js";
import {
  aiExpenseScanSchema,
  aiInsightsResponseSchema,
  aiInvoiceSuggestionSchema,
} from "./ai.schema.js";
import {
  chatCompletion,
  parseJsonObject,
  transcribeAudio,
} from "./openai.client.js";

export type ClientMatchStatus = "matched" | "ambiguous" | "none" | "provided";

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveClientMatch(
  companyId: string,
  clientId: string | undefined,
  clientHint: string | undefined,
): Promise<{
  clientId: string | null;
  clientMatch: ClientMatchStatus;
  matchedClientName?: string;
}> {
  if (clientId) {
    const client = await Client.findOne({
      _id: clientId,
      companyId,
      isDeleted: false,
    }).lean();
    if (!client) {
      throw notFound("Client not found");
    }
    return {
      clientId: String(client._id),
      clientMatch: "provided",
      matchedClientName: client.name,
    };
  }

  if (!clientHint?.trim()) {
    return { clientId: null, clientMatch: "none" };
  }

  const hint = normalizeName(clientHint);
  const clients = await Client.find({
    companyId,
    isDeleted: false,
  })
    .select("_id name email")
    .lean();

  const matches = clients.filter((c) => {
    const name = normalizeName(c.name);
    const email = (c.email ?? "").toLowerCase();
    return (
      name === hint ||
      name.includes(hint) ||
      hint.includes(name) ||
      (email && (email === hint || email.includes(hint)))
    );
  });

  if (matches.length === 1) {
    const only = matches[0]!;
    return {
      clientId: String(only._id),
      clientMatch: "matched",
      matchedClientName: only.name,
    };
  }
  if (matches.length > 1) {
    return { clientId: null, clientMatch: "ambiguous" };
  }
  return { clientId: null, clientMatch: "none" };
}

async function matchCatalogIds(
  companyId: string,
  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    catalogHint?: string;
  }>,
) {
  const [products, services] = await Promise.all([
    Product.find({ companyId, isDeleted: false }).select("_id name").lean(),
    Service.find({ companyId, isDeleted: false }).select("_id name").lean(),
  ]);

  return items.map((item) => {
    const needle = normalizeName(item.catalogHint || item.name);
    const product = products.find((p) => normalizeName(p.name) === needle);
    const service = !product
      ? services.find((s) => normalizeName(s.name) === needle)
      : undefined;

    return {
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(product ? { productId: String(product._id) } : {}),
      ...(service ? { serviceId: String(service._id) } : {}),
    };
  });
}

function buildInvoiceSystemPrompt(): string {
  const today = isoDateOnly(new Date());
  return `You are an invoice drafting assistant for InvoiceGen.
Return ONLY a JSON object (no markdown) with this shape:
{
  "clientHint": "optional client name or email from the prompt",
  "currency": "USD",
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "items": [{ "name": string, "description"?: string, "quantity": number, "unitPrice": integer cents, "catalogHint"?: string }],
  "discountAmount": integer cents,
  "shippingAmount": integer cents,
  "notes"?: string,
  "terms"?: string,
  "paymentInstructions"?: string,
  "footer"?: string
}
Rules:
- unitPrice, discountAmount, shippingAmount are integer minor units (cents). $12.50 => 1250.
- quantity must be > 0.
- Prefer today's date (${today}) for issueDate if unspecified; dueDate ~14 days later if unspecified.
- Do not invent MongoDB ObjectIds.
- Infer reasonable line items from the user prompt.`;
}

async function buildInvoiceDraftFromPrompt(params: {
  companyId: string;
  prompt: string;
  clientId?: string;
}) {
  const raw = await chatCompletion({
    messages: [
      { role: "system", content: buildInvoiceSystemPrompt() },
      { role: "user", content: params.prompt },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.2,
  });

  const parsed = aiInvoiceSuggestionSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) {
    throw badRequest(
      "AI invoice suggestion failed validation",
      "AI_INVALID_RESPONSE",
      { issues: parsed.error.issues.map((i) => i.message) },
    );
  }

  const suggestion = parsed.data;
  const client = await resolveClientMatch(
    params.companyId,
    params.clientId,
    suggestion.clientHint,
  );
  const items = await matchCatalogIds(params.companyId, suggestion.items);

  return {
    draft: {
      clientId: client.clientId,
      currency: suggestion.currency.toUpperCase(),
      issueDate: suggestion.issueDate,
      dueDate: suggestion.dueDate,
      items,
      discountAmount: suggestion.discountAmount,
      shippingAmount: suggestion.shippingAmount,
      notes: suggestion.notes,
      terms: suggestion.terms,
      paymentInstructions: suggestion.paymentInstructions,
      footer: suggestion.footer,
    },
    clientMatch: client.clientMatch,
    matchedClientName: client.matchedClientName,
    clientHint: suggestion.clientHint,
  };
}

export async function generateInvoiceDraft(params: {
  companyId: string;
  prompt: string;
  clientId?: string;
}) {
  await assertAiInvoicesEntitlement(params.companyId);
  assertAiDailyCap(params.companyId);
  return buildInvoiceDraftFromPrompt(params);
}

export async function generateInvoiceDraftFromVoice(params: {
  companyId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  clientId?: string;
}) {
  await assertAiInvoicesEntitlement(params.companyId);
  assertAiDailyCap(params.companyId);

  const transcript = await transcribeAudio(
    params.buffer,
    params.filename,
    params.mimeType,
  );

  const result = await buildInvoiceDraftFromPrompt({
    companyId: params.companyId,
    prompt: transcript,
    clientId: params.clientId,
  });

  return { ...result, transcript };
}

/** Best-effort extract of printable text from a PDF buffer (no PDF library). */
export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const paren = /\((?:\\.|[^\\)])*\)/g;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(raw)) !== null) {
    const inner = m[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[\x20-\x7E]{2,}/.test(inner)) {
      chunks.push(inner);
    }
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export async function scanExpenseReceipt(params: {
  companyId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  await assertOcrReceiptsEntitlement(params.companyId);
  assertAiDailyCap(params.companyId);

  const system = `You extract expense fields from a receipt.
Return ONLY JSON:
{
  "amount": integer cents (e.g. $12.50 => 1250),
  "currency": "USD",
  "category": short category string,
  "date": "YYYY-MM-DD",
  "vendor": optional string,
  "notes": optional string,
  "confidence": 0-1 number
}
If unclear, make a best guess and lower confidence.`;

  let raw: string;

  if (params.mimeType === "application/pdf") {
    const text = extractPdfText(params.buffer);
    if (text.length < 20) {
      throw badRequest(
        "Could not extract text from this PDF. Upload a PNG, JPEG, or WEBP image of the receipt.",
        "OCR_PDF_UNSUPPORTED",
      );
    }
    raw = await chatCompletion({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Receipt filename: ${params.originalName}\nExtracted PDF text:\n${text.slice(0, 8000)}`,
        },
      ],
      responseFormat: { type: "json_object" },
    });
  } else {
    const b64 = params.buffer.toString("base64");
    const dataUrl = `data:${params.mimeType};base64,${b64}`;
    raw = await chatCompletion({
      model: env.OPENAI_VISION_MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract expense fields from this receipt image (${params.originalName}).`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      responseFormat: { type: "json_object" },
    });
  }

  const parsed = aiExpenseScanSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) {
    throw badRequest(
      "OCR suggestion failed validation",
      "AI_INVALID_RESPONSE",
      { issues: parsed.error.issues.map((i) => i.message) },
    );
  }

  return {
    suggestion: {
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      category: parsed.data.category,
      date: parsed.data.date,
      vendor: parsed.data.vendor,
      notes: parsed.data.notes,
      confidence: parsed.data.confidence ?? null,
    },
  };
}

export async function generateFinancialInsights(params: {
  companyId: string;
  from: Date;
  to: Date;
  question?: string;
}) {
  await assertAiInsightsEntitlement(params.companyId);
  assertAiDailyCap(params.companyId);

  const metrics = await getReportSummary(
    params.companyId,
    params.from,
    params.to,
  );

  const metricsPayload = {
    from: metrics.from,
    to: metrics.to,
    revenueCents: metrics.revenue,
    paidInvoiceCount: metrics.paidInvoiceCount,
    outstandingCents: metrics.outstanding,
    outstandingCount: metrics.outstandingCount,
    expensesCents: metrics.expenses,
    expenseCount: metrics.expenseCount,
    netCents: metrics.net,
    invoiceStatusBreakdown: metrics.invoiceStatusBreakdown,
    revenueOverTime: metrics.revenueOverTime,
    expensesOverTime: metrics.expensesOverTime,
    note: "Amounts are integer cents and may mix currencies.",
  };

  const question =
    params.question?.trim() ||
    "Summarize performance for this period and highlight notable trends.";

  const raw = await chatCompletion({
    messages: [
      {
        role: "system",
        content: `You are a financial insights assistant for InvoiceGen.
You may ONLY use the provided metrics JSON. Do not invent invoices, clients, or amounts.
If the user asks for detail not in the metrics, say you cannot answer from the available aggregates.
Money in the metrics is integer cents.
Return ONLY JSON: { "summary": string, "bullets": string[] }`,
      },
      {
        role: "user",
        content: `Question: ${question}\n\nMetrics:\n${JSON.stringify(metricsPayload)}`,
      },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.3,
  });

  const parsed = aiInsightsResponseSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) {
    throw badRequest(
      "AI insights failed validation",
      "AI_INVALID_RESPONSE",
      { issues: parsed.error.issues.map((i) => i.message) },
    );
  }

  return {
    summary: parsed.data.summary,
    bullets: parsed.data.bullets,
    metricsRef: {
      from: metrics.from,
      to: metrics.to,
      revenue: metrics.revenue,
      expenses: metrics.expenses,
      net: metrics.net,
      outstanding: metrics.outstanding,
      paidInvoiceCount: metrics.paidInvoiceCount,
      expenseCount: metrics.expenseCount,
      outstandingCount: metrics.outstandingCount,
    },
  };
}
