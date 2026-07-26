import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(64),
  JWT_REFRESH_SECRET: z.string().min(64),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  CLIENT_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  ENCRYPTION_KEY: z.string().length(64),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@invoicegen.local"),
  SENTRY_DSN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2_097_152),
  /** Optional — empty disables all /ai routes (same pattern as Stripe). */
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_VISION_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_STT_MODEL: z.string().default("whisper-1"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(2_048),
  /** Audio uploads for voice invoices (default 10MB). */
  MAX_AUDIO_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
  /** Soft daily cap per company for AI calls (in-memory; resets on restart). */
  AI_DAILY_REQUEST_CAP: z.coerce.number().int().positive().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
  console.error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
