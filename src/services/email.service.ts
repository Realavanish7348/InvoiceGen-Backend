import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

function createTransport() {
  if (!env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 465,
    secure: (env.SMTP_PORT ?? 465) === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });
}

const transporter = createTransport();

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}): Promise<{ messageId?: string }> {
  if (!transporter) {
    // Dev fallback: no SMTP configured — print the link so it is clickable in the terminal
    const link =
      options.text?.match(/https?:\/\/\S+/)?.[0] ??
      options.html.match(/href="(https?:\/\/[^"]+)"/)?.[1];
    logger.info("Email (dev/no-SMTP)", {
      to: options.to,
      subject: options.subject,
      link,
      text: options.text,
      attachments: options.attachments?.map((a) => a.filename),
    });
    if (link) {
      // Plain URL on its own line so most terminals make it clickable
      console.log(`\n>>> Open this link: ${link}\n`);
    }
    return { messageId: `dev-${Date.now()}` };
  }

  const info = await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return { messageId: info.messageId };
}

export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  const url = `${env.CLIENT_URL}/verify-email?token=${token}`;
  await sendEmail({
    to,
    subject: "Verify your InvoiceGen email",
    html: `<p>Verify your email:</p><p><a href="${url}">${url}</a></p>`,
    text: `Verify your email: ${url}`,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<void> {
  const url = `${env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({
    to,
    subject: "Reset your InvoiceGen password",
    html: `<p>Reset your password:</p><p><a href="${url}">${url}</a></p>`,
    text: `Reset your password: ${url}`,
  });
}

export async function sendPortalMagicLinkEmail(
  to: string,
  token: string,
): Promise<void> {
  const url = `${env.CLIENT_URL}/portal/verify?email=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: "Your InvoiceGen client portal link",
    html: `<p>Sign in to view and pay your invoices:</p><p><a href="${url}">${url}</a></p><p>This link expires in 15 minutes.</p>`,
    text: `Sign in to the InvoiceGen client portal: ${url}\nThis link expires in 15 minutes.`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCents(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(Number(amount));
  } catch {
    return `${currency.toUpperCase()} ${amount}`;
  }
}

export async function sendInvoiceEmail(options: {
  to: string;
  invoiceNumber: string;
  companyName: string;
  clientName?: string;
  grandTotal: number;
  currency: string;
  dueDate: Date;
  message?: string;
  paymentUrl?: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): Promise<{ messageId?: string }> {
  const greeting = options.clientName
    ? `Hi ${escapeHtml(options.clientName)},`
    : "Hello,";
  const total = formatCents(options.grandTotal, options.currency);
  const due = options.dueDate.toISOString().slice(0, 10);
  const custom = options.message
    ? `<p>${escapeHtml(options.message).replace(/\n/g, "<br/>")}</p>`
    : "";
  const subject = `Invoice ${options.invoiceNumber} from ${options.companyName}`;
  const payHtml = options.paymentUrl
    ? `<p><a href="${escapeHtml(options.paymentUrl)}">Pay this invoice online</a></p>`
    : "";
  const payText = options.paymentUrl
    ? `\nPay online: ${options.paymentUrl}\n`
    : "";

  const html = `
    <p>${greeting}</p>
    <p>Please find invoice <strong>${escapeHtml(options.invoiceNumber)}</strong> from
    <strong>${escapeHtml(options.companyName)}</strong> attached as a PDF.</p>
    ${custom}
    <ul>
      <li>Amount due: <strong>${escapeHtml(total)}</strong></li>
      <li>Due date: <strong>${escapeHtml(due)}</strong></li>
    </ul>
    ${payHtml}
    <p>Thank you,<br/>${escapeHtml(options.companyName)}</p>
  `;

  const textLines = [
    options.clientName ? `Hi ${options.clientName},` : "Hello,",
    "",
    `Please find invoice ${options.invoiceNumber} from ${options.companyName} attached as a PDF.`,
    options.message ? `\n${options.message}\n` : "",
    `Amount due: ${total}`,
    `Due date: ${due}`,
    payText,
    "",
    `Thank you,\n${options.companyName}`,
  ];

  return sendEmail({
    to: options.to,
    subject,
    html,
    text: textLines.filter((line) => line !== undefined).join("\n"),
    attachments: [
      {
        filename: options.pdfFilename,
        content: options.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
