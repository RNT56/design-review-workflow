import { LlmProvider, LlmRequest, LlmResponse, ModelRouter } from "./router.js";

export type ProviderEnv = Record<string, string | undefined>;

export type ProviderRouterOptions = { allowedProviders?: string[] };

export function createModelRouterFromEnv(env: ProviderEnv = process.env, options: ProviderRouterOptions = {}): ModelRouter {
  const providers: LlmProvider[] = [];
  const allowed = options.allowedProviders?.length ? new Set(options.allowedProviders) : undefined;
  const timeoutMs = providerTimeout(env);
  const maxOutputTokens = providerMaxOutputTokens(env);
  if ((!allowed || allowed.has("openai")) && env.OPENAI_API_KEY && env.OPENAI_MODEL) {
    providers.push(new OpenAiResponsesProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL, timeoutMs, maxOutputTokens));
  }
  if ((!allowed || allowed.has("openrouter")) && env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL) {
    providers.push(new OpenRouterProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL, timeoutMs, maxOutputTokens));
  }
  if ((!allowed || allowed.has("anthropic")) && env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL) {
    providers.push(new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL, timeoutMs, maxOutputTokens));
  }
  if ((!allowed || allowed.has("gemini")) && env.GEMINI_API_KEY && env.GEMINI_MODEL) {
    providers.push(new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL, timeoutMs, maxOutputTokens));
  }
  return new ModelRouter(providers);
}

export class OpenAiResponsesProvider implements LlmProvider {
  name = "openai";
  supportsVision = true;
  supportsStructuredOutput = true;
  supportsToolUse = true;

  constructor(private readonly apiKey: string, private readonly model: string, private readonly timeoutMs = 120_000, private readonly maxOutputTokens = 16_384) {}

  async generate(input: LlmRequest): Promise<LlmResponse> {
    const content = [
      { type: "input_text", text: JSON.stringify(input.input) },
      ...(input.images ?? []).map((image) => ({
        type: "input_image",
        image_url: imageDataUrl(image),
        detail: image.detail ?? "auto"
      }))
    ];
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        max_output_tokens: this.maxOutputTokens,
        ...(input.jsonSchema ? { text: { format: { type: "json_schema", name: input.schemaName ?? "structured_output", strict: false, schema: input.jsonSchema } } } : {}),
        input: [
          { role: "system", content: input.system },
          { role: "user", content }
        ]
      })
    });
    const raw = await parseProviderResponse(response);
    return {
      provider: this.name,
      model: this.model,
      output: extractOpenAiOutput(raw),
      raw
    };
  }
}

export class OpenRouterProvider implements LlmProvider {
  name = "openrouter";
  supportsVision = true;
  supportsStructuredOutput = false;
  supportsToolUse = false;

  constructor(private readonly apiKey: string, private readonly model: string, private readonly timeoutMs = 120_000, private readonly maxOutputTokens = 16_384) {}

  async generate(input: LlmRequest): Promise<LlmResponse> {
    const content = [
      { type: "text", text: JSON.stringify(input.input) },
      ...(input.images ?? []).map((image) => ({
        type: "image_url",
        image_url: { url: imageDataUrl(image) }
      }))
    ];
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxOutputTokens,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content }
        ]
      })
    });
    const raw = await parseProviderResponse(response);
    return {
      provider: this.name,
      model: this.model,
      output: raw.choices?.[0]?.message?.content ?? raw,
      raw
    };
  }
}

export class AnthropicProvider implements LlmProvider {
  name = "anthropic";
  supportsVision = true;
  supportsStructuredOutput = false;
  supportsToolUse = true;

  constructor(private readonly apiKey: string, private readonly model: string, private readonly timeoutMs = 120_000, private readonly maxOutputTokens = 16_384) {}

  async generate(input: LlmRequest): Promise<LlmResponse> {
    const content = [
      { type: "text", text: JSON.stringify(input.input) },
      ...(input.images ?? []).map((image) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType,
          data: image.data
        }
      }))
    ];
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxOutputTokens,
        system: input.system,
        messages: [{ role: "user", content }]
      })
    });
    const raw = await parseProviderResponse(response);
    return {
      provider: this.name,
      model: this.model,
      output: raw.content?.map((item: { text?: string }) => item.text).filter(Boolean).join("\n") ?? raw,
      raw
    };
  }
}

export class GeminiProvider implements LlmProvider {
  name = "gemini";
  supportsVision = true;
  supportsStructuredOutput = true;
  supportsToolUse = false;

  constructor(private readonly apiKey: string, private readonly model: string, private readonly timeoutMs = 120_000, private readonly maxOutputTokens = 16_384) {}

  async generate(input: LlmRequest): Promise<LlmResponse> {
    const parts = [
      { text: JSON.stringify(input.input) },
      ...(input.images ?? []).map((image) => ({
        inlineData: {
          mimeType: image.mediaType,
          data: image.data
        }
      }))
    ];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: this.maxOutputTokens, responseMimeType: "application/json" }
      })
    });
    const raw = await parseProviderResponse(response);
    return {
      provider: this.name,
      model: this.model,
      output: raw.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text).filter(Boolean).join("\n") ?? raw,
      raw
    };
  }
}

function imageDataUrl(image: NonNullable<LlmRequest["images"]>[number]): string {
  return `data:${image.mediaType};base64,${image.data}`;
}

async function parseProviderResponse(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  let json: Record<string, any>;
  try {
    json = JSON.parse(text) as Record<string, any>;
  } catch {
    json = { text };
  }
  if (!response.ok) {
    throw new Error(`Provider request failed with ${response.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
}

function extractOpenAiOutput(raw: Record<string, any>): unknown {
  if (typeof raw.output_text === "string") {
    return raw.output_text;
  }
  const parts = raw.output
    ?.flatMap((item: { content?: Array<{ text?: string; type?: string }> }) => item.content ?? [])
    ?.map((content: { text?: string }) => content.text)
    ?.filter(Boolean);
  return parts?.length ? parts.join("\n") : raw;
}

function providerTimeout(env: ProviderEnv): number {
  const configured = Number(env.DESIGN_REVIEW_PROVIDER_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(configured) ? Math.max(5_000, Math.min(600_000, configured)) : 120_000;
}

function providerMaxOutputTokens(env: ProviderEnv): number {
  const configured = Number(env.DESIGN_REVIEW_PROVIDER_MAX_OUTPUT_TOKENS ?? 16_384);
  return Number.isFinite(configured) ? Math.max(2_048, Math.min(65_536, Math.round(configured))) : 16_384;
}
