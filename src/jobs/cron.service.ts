import cron, { type ScheduledTask } from "node-cron";
import { Invoice } from "../modules/invoices/invoice.model.js";
import { Client } from "../modules/clients/client.model.js";
import { Product } from "../modules/products/product.model.js";
import { Service } from "../modules/services/service.model.js";
import { TaxRule } from "../modules/taxRules/taxRule.model.js";
import { InvoiceTemplate } from "../modules/templates/template.model.js";
import { createNotification } from "../services/notification.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const OVERDUE_STATUSES = ["pending", "published"] as const;

/**
 * Flips invoices past their due date into "overdue" status and notifies the
 * invoice creator. Returns the number of invoices transitioned.
 */
export async function markOverdueInvoices(): Promise<number> {
  const now = new Date();
  const filter = {
    status: { $in: OVERDUE_STATUSES },
    dueDate: { $lt: now },
    isDeleted: false,
  };

  const candidates = await Invoice.find(filter)
    .select("_id companyId createdByUserId invoiceNumber")
    .lean();

  if (candidates.length === 0) return 0;

  await Invoice.updateMany(filter, { $set: { status: "overdue" } });

  await Promise.all(
    candidates.map((invoice) =>
      invoice.createdByUserId
        ? createNotification({
            companyId: invoice.companyId,
            userId: invoice.createdByUserId,
            type: "invoice_overdue",
            title: "Invoice overdue",
            message: `Invoice ${invoice.invoiceNumber} is now overdue.`,
            resourceType: "invoice",
            resourceId: invoice._id,
          })
        : Promise.resolve(null),
    ),
  );

  logger.info("Marked invoices overdue", { count: candidates.length });
  return candidates.length;
}

export type PurgeTrashResult = {
  invoices: number;
  clients: number;
  products: number;
  services: number;
  taxRules: number;
  templates: number;
};

/**
 * Permanently deletes soft-deleted resources whose deletedAt is older than
 * the 30-day trash retention window.
 */
export async function purgeTrash(): Promise<PurgeTrashResult> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  const staleFilter = { isDeleted: true, deletedAt: { $lt: cutoff } };

  const [invoices, clients, products, services, taxRules, templates] =
    await Promise.all([
      Invoice.deleteMany(staleFilter),
      Client.deleteMany(staleFilter),
      Product.deleteMany(staleFilter),
      Service.deleteMany(staleFilter),
      TaxRule.deleteMany(staleFilter),
      InvoiceTemplate.deleteMany(staleFilter),
    ]);

  const result: PurgeTrashResult = {
    invoices: invoices.deletedCount ?? 0,
    clients: clients.deletedCount ?? 0,
    products: products.deletedCount ?? 0,
    services: services.deletedCount ?? 0,
    taxRules: taxRules.deletedCount ?? 0,
    templates: templates.deletedCount ?? 0,
  };

  const totalPurged = Object.values(result).reduce((sum, n) => sum + n, 0);
  if (totalPurged > 0) {
    logger.info("Purged trash", result);
  }

  return result;
}

let scheduledTasks: ScheduledTask[] = [];

/**
 * Registers recurring background jobs. No-op in the test environment so
 * test suites remain deterministic and don't leak timers.
 */
export function startCronJobs(): void {
  if (env.NODE_ENV === "test") return;
  if (scheduledTasks.length > 0) return;

  const overdueTask = cron.schedule("*/15 * * * *", () => {
    markOverdueInvoices().catch((err) => {
      logger.error("markOverdueInvoices job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  const purgeTask = cron.schedule("0 3 * * *", () => {
    purgeTrash().catch((err) => {
      logger.error("purgeTrash job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  scheduledTasks = [overdueTask, purgeTask];
  logger.info("Cron jobs started");
}

export function stopCronJobs(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks = [];
}
