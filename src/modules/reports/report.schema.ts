import { z } from "zod";

export const reportSummaryQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});
