import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { InvoiceDocument } from "../modules/invoices/invoice.model.js";
import type { CompanyDocument } from "../modules/companies/company.model.js";

export type GenerateInvoicePdfOptions = {
  watermark?: boolean;
  watermarkText?: string;
};

const PAGE_MARGIN = 50;
const COLOR_TEXT = "#011627";
const COLOR_MUTED = "#5c6b73";
const COLOR_BORDER = "#dfe7eb";

function formatMoney(amountMinor: number, currency: string): string {
  const major = (amountMinor ?? 0) / 100;
  return `${currency} ${major.toFixed(2)}`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function resolveLogoPath(logoUrl?: string | null): string | null {
  if (!logoUrl) return null;
  const relative = logoUrl.startsWith("/") ? logoUrl.slice(1) : logoUrl;
  const absolute = path.resolve(process.cwd(), relative);
  return fs.existsSync(absolute) ? absolute : null;
}

function drawWatermark(doc: PDFKit.PDFDocument, text: string) {
  const { width, height } = doc.page;
  doc.save();
  doc
    .fillColor("#cccccc")
    .fillOpacity(0.35)
    .fontSize(90)
    .font("Helvetica-Bold");
  doc.rotate(-40, { origin: [width / 2, height / 2] });
  doc.text(text, 0, height / 2 - 45, { width, align: "center" });
  doc.restore();
  doc.fillOpacity(1);
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceDocument,
  company: CompanyDocument | null,
) {
  const logoPath = resolveLogoPath(company?.logoUrl);
  const startY = PAGE_MARGIN;

  if (logoPath) {
    try {
      doc.image(logoPath, PAGE_MARGIN, startY, { fit: [110, 60] });
    } catch {
      // Corrupt/unsupported image — skip silently, layout still renders.
    }
  }

  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(company?.name ?? "Your Company", logoPath ? 170 : PAGE_MARGIN, startY, {
      width: 280,
    });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text(
      [company?.email, company?.phone, company?.taxNumber && `Tax No: ${company.taxNumber}`]
        .filter(Boolean)
        .join("  |  "),
      logoPath ? 170 : PAGE_MARGIN,
      startY + 26,
      { width: 280 },
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(26)
    .fillColor(COLOR_TEXT)
    .text("INVOICE", 0, startY, {
      align: "right",
      width: doc.page.width - PAGE_MARGIN * 2,
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLOR_MUTED)
    .text(`# ${invoice.invoiceNumber}`, 0, startY + 32, {
      align: "right",
      width: doc.page.width - PAGE_MARGIN * 2,
    })
    .text(String(invoice.status).toUpperCase(), 0, startY + 46, {
      align: "right",
      width: doc.page.width - PAGE_MARGIN * 2,
    });

  doc.moveDown(3);
}

function drawPartiesAndMeta(doc: PDFKit.PDFDocument, invoice: InvoiceDocument) {
  const top = 140;
  const colWidth = (doc.page.width - PAGE_MARGIN * 2) / 2;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLOR_MUTED)
    .text("BILL TO", PAGE_MARGIN, top);

  const client = invoice.clientSnapshot;
  const clientLines = [
    client?.name,
    client?.company,
    client?.email,
    client?.phone,
    client?.address &&
      [client.address.street, client.address.city, client.address.state, client.address.zip, client.address.country]
        .filter(Boolean)
        .join(", "),
  ].filter(Boolean);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLOR_TEXT)
    .text(clientLines.join("\n") || "-", PAGE_MARGIN, top + 16, { width: colWidth - 20 });

  const metaX = PAGE_MARGIN + colWidth;
  const rows: Array<[string, string]> = [
    ["Issue Date", formatDate(invoice.issueDate)],
    ["Due Date", formatDate(invoice.dueDate)],
    ["Currency", invoice.currency],
  ];

  let metaY = top;
  for (const [label, value] of rows) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(label, metaX, metaY, { width: colWidth, align: "right" });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLOR_TEXT)
      .text(value, metaX, metaY + 12, { width: colWidth, align: "right" });
    metaY += 32;
  }
}

function drawItemsTable(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceDocument,
  startY: number,
): number {
  const tableX = PAGE_MARGIN;
  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const columns = [
    { key: "name", label: "Description", width: tableWidth * 0.4 },
    { key: "quantity", label: "Qty", width: tableWidth * 0.15, align: "right" as const },
    { key: "unitPrice", label: "Unit Price", width: tableWidth * 0.2, align: "right" as const },
    { key: "amount", label: "Amount", width: tableWidth * 0.25, align: "right" as const },
  ];

  let y = startY;
  doc.rect(tableX, y, tableWidth, 22).fill(COLOR_TEXT);
  let x = tableX;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");
  for (const col of columns) {
    doc.text(col.label, x + 8, y + 6, { width: col.width - 16, align: col.align ?? "left" });
    x += col.width;
  }
  y += 22;

  doc.font("Helvetica").fontSize(9.5).fillColor(COLOR_TEXT);
  for (const item of invoice.items ?? []) {
    const rowHeight = 22;
    if (y + rowHeight > doc.page.height - 200) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    x = tableX;
    doc.text(item.name, x + 8, y + 6, { width: columns[0]!.width - 16 });
    x += columns[0]!.width;
    doc.text(String(item.quantity), x + 8, y + 6, {
      width: columns[1]!.width - 16,
      align: "right",
    });
    x += columns[1]!.width;
    doc.text(formatMoney(item.unitPrice, invoice.currency), x + 8, y + 6, {
      width: columns[2]!.width - 16,
      align: "right",
    });
    x += columns[2]!.width;
    doc.text(formatMoney(item.amount, invoice.currency), x + 8, y + 6, {
      width: columns[3]!.width - 16,
      align: "right",
    });

    doc
      .strokeColor(COLOR_BORDER)
      .moveTo(tableX, y + rowHeight)
      .lineTo(tableX + tableWidth, y + rowHeight)
      .stroke();

    y += rowHeight;
  }

  return y + 20;
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceDocument,
  startY: number,
): number {
  const boxWidth = 240;
  const x = doc.page.width - PAGE_MARGIN - boxWidth;
  let y = startY;

  const rows: Array<[string, number]> = [
    ["Subtotal", invoice.subtotal],
    ["Discount", -Math.abs(invoice.discountAmount ?? 0)],
    ["Tax", invoice.taxAmount],
    ["Shipping", invoice.shippingAmount],
  ];

  doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);
  for (const [label, amount] of rows) {
    doc.text(label, x, y, { width: boxWidth - 100 });
    doc.text(formatMoney(amount, invoice.currency), x + boxWidth - 100, y, {
      width: 100,
      align: "right",
    });
    y += 18;
  }

  doc
    .strokeColor(COLOR_BORDER)
    .moveTo(x, y + 2)
    .lineTo(x + boxWidth, y + 2)
    .stroke();
  y += 10;

  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT);
  doc.text("Grand Total", x, y, { width: boxWidth - 100 });
  doc.text(formatMoney(invoice.grandTotal, invoice.currency), x + boxWidth - 100, y, {
    width: 100,
    align: "right",
  });

  return y + 40;
}

function drawNotes(doc: PDFKit.PDFDocument, invoice: InvoiceDocument, startY: number) {
  let y = startY;
  const width = doc.page.width - PAGE_MARGIN * 2;

  const sections: Array<[string, string | null | undefined]> = [
    ["Notes", invoice.notes],
    ["Terms", invoice.terms],
    ["Payment Instructions", invoice.paymentInstructions],
  ];

  for (const [label, value] of sections) {
    if (!value) continue;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED).text(label, PAGE_MARGIN, y, {
      width,
    });
    y += 14;
    doc.font("Helvetica").fontSize(9.5).fillColor(COLOR_TEXT).text(value, PAGE_MARGIN, y, {
      width,
    });
    y += doc.heightOfString(value, { width }) + 14;
  }

  if (invoice.footer) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLOR_MUTED)
      .text(invoice.footer, PAGE_MARGIN, doc.page.height - 70, {
        width,
        align: "center",
      });
  }
}

/**
 * Renders a single-page (or paginated) A4 invoice PDF into a Buffer.
 * Pure/synchronous-per-document generation — no disk writes.
 */
export async function generateInvoicePdf(
  invoice: InvoiceDocument,
  company: CompanyDocument | null,
  options: GenerateInvoicePdfOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawHeader(doc, invoice, company);
      drawPartiesAndMeta(doc, invoice);
      const afterTable = drawItemsTable(doc, invoice, 260);
      const afterTotals = drawTotals(doc, invoice, afterTable);
      drawNotes(doc, invoice, afterTotals);

      if (options.watermark) {
        const text = options.watermarkText || String(invoice.status).toUpperCase();
        const pageRange = doc.bufferedPageRange();
        for (let i = 0; i < pageRange.count; i += 1) {
          doc.switchToPage(pageRange.start + i);
          drawWatermark(doc, text);
        }
      }

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
