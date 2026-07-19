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

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
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
    });
    if (link) {
      // Plain URL on its own line so most terminals make it clickable
      console.log(`\n>>> Open this link: ${link}\n`);
    }
    return;
  }

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
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
