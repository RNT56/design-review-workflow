import { LlmProvider, LlmRequest, LlmResponse, ModelRouter } from "./router.js";

export type ProviderEnv = Record<string, string | undefined>;

export function createModelRouterFromEnv(env: ProviderEnv = process.env): ModelRouter {
  const providers: LlmProvider[] = [];
  if (env.OPENAI_API_KEY && env.OPENAI_MODEL) {
    providers.push(new OpenAiResponsesProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL));
  }
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL) {
    providers.push(new OpenRouterProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL));
  }
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL) {
    providers.push(new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL));
  }
  if (env.GEMINI_API_KEY && env.GEMINI_MODEL) {
    providers.push(new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL));
  }
  return new ModelRouter(providers);
}

export class OpenAiResponsesProvider implements LlmProvider {
  name = "openai";
  supportsVision = true;
  supportsStructuredOutput = true;
  supportsToolUse = true;

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async generate(input: LlmRequest): Promise<LlmResponse> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          { role: "system", content: input.system },
          { role: "user", content: JSON.stringify(input.input) }
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

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async generate(input: LlmRequest): Promise<LlmResponse> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: JSON.stringify(input.input) }
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

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async generate(input: LlmRequest): Promise<LlmResponse> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: input.system,
        messages: [{ role: "user", content: JSON.stringify(input.input) }]
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

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async generate(input: LlmRequest): Promise<LlmResponse> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(input.input) }] }]
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
