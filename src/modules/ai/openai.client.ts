import { env } from "../../config/env.js";
import { badRequest } from "../../utils/AppError.js";

export function isAiConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export function assertAiConfigured(): void {
  if (!isAiConfigured()) {
    throw badRequest(
      "AI features are not configured. Set OPENAI_API_KEY.",
      "AI_NOT_CONFIGURED",
    );
  }
}

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

export type ChatCompletionParams = {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" };
};

/** Overridable in tests via `setChatCompletionImpl`. */
let chatCompletionImpl: (
  params: ChatCompletionParams,
) => Promise<string> = defaultChatCompletion;
let chatCompletionOverridden = false;

let transcribeImpl: (
  buffer: Buffer,
  filename: string,
  mimeType: string,
) => Promise<string> = defaultTranscribe;
let transcribeOverridden = false;

export function setChatCompletionImpl(
  impl: typeof chatCompletionImpl | null,
): void {
  if (impl == null) {
    chatCompletionImpl = defaultChatCompletion;
    chatCompletionOverridden = false;
    return;
  }
  chatCompletionImpl = impl;
  chatCompletionOverridden = true;
}

export function setTranscribeImpl(impl: typeof transcribeImpl | null): void {
  if (impl == null) {
    transcribeImpl = defaultTranscribe;
    transcribeOverridden = false;
    return;
  }
  transcribeImpl = impl;
  transcribeOverridden = true;
}

export async function chatCompletion(
  params: ChatCompletionParams,
): Promise<string> {
  if (!chatCompletionOverridden) {
    assertAiConfigured();
  }
  return chatCompletionImpl(params);
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (!transcribeOverridden) {
    assertAiConfigured();
  }
  return transcribeImpl(buffer, filename, mimeType);
}

/**
 * Ready for an AI call: real key present, or a test mock override is installed.
 * Used before daily-cap so unconfigured requests do not burn quota.
 */
export function assertAiReady(): void {
  if (isAiConfigured() || chatCompletionOverridden || transcribeOverridden) {
    return;
  }
  assertAiConfigured();
}

async function defaultChatCompletion(
  params: ChatCompletionParams,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.OPENAI_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model ?? env.OPENAI_MODEL,
        messages: params.messages,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? env.OPENAI_MAX_TOKENS,
        ...(params.responseFormat
          ? { response_format: params.responseFormat }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw badRequest(
        `AI provider error (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
        "AI_PROVIDER_ERROR",
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw badRequest("AI provider returned empty content", "AI_PROVIDER_ERROR");
    }
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw badRequest("AI provider request timed out", "AI_PROVIDER_TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function defaultTranscribe(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    filename || "audio.webm",
  );
  form.append("model", env.OPENAI_STT_MODEL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.OPENAI_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw badRequest(
        `AI transcription error (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
        "AI_PROVIDER_ERROR",
      );
    }

    const json = (await res.json()) as { text?: string };
    if (!json.text?.trim()) {
      throw badRequest(
        "AI provider returned empty transcript",
        "AI_PROVIDER_ERROR",
      );
    }
    return json.text.trim();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw badRequest("AI transcription timed out", "AI_PROVIDER_TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    throw badRequest(
      "AI returned invalid JSON; try again with a clearer prompt",
      "AI_INVALID_RESPONSE",
    );
  }
}
