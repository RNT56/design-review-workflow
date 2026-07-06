export type ModelProfile =
  | "vision_premium"
  | "vision_fast"
  | "reasoning_premium"
  | "reasoning_balanced"
  | "json_strict"
  | "copywriting"
  | "qa_critic"
  | "cheap_classifier";

export type LlmRequest = {
  profile: ModelProfile;
  system: string;
  input: unknown;
  schemaName?: string;
};

export type LlmResponse = {
  provider: string;
  model: string;
  output: unknown;
  raw?: unknown;
};

export interface LlmProvider {
  name: string;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  supportsToolUse: boolean;
  generate(input: LlmRequest): Promise<LlmResponse>;
}

export class ModelRouter {
  private providers: LlmProvider[];

  constructor(providers: LlmProvider[] = []) {
    this.providers = providers;
  }

  hasProviders(): boolean {
    return this.providers.length > 0;
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const provider = this.providers[0];
    if (!provider) {
      throw new Error("No LLM providers are configured. The MVP deterministic reviewers should be used instead.");
    }
    return provider.generate(request);
  }
}
