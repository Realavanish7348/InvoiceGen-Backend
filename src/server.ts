import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { startCronJobs } from "./jobs/cron.service.js";
import { logger } from "./utils/logger.js";

async function main() {
  await connectDb();
  startCronJobs();

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`InvoiceGen API listening on port ${env.PORT}`, {
      env: env.NODE_ENV,
    });
  });
}

main().catch((err) => {
  logger.error("Failed to start server", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
