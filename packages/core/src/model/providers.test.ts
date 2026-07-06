import { describe, expect, it } from "vitest";
import { createModelRouterFromEnv } from "./providers.js";

describe("createModelRouterFromEnv", () => {
  it("creates an empty router when no keys are configured", () => {
    expect(createModelRouterFromEnv({}).hasProviders()).toBe(false);
  });

  it("detects configured providers", () => {
    expect(createModelRouterFromEnv({ OPENAI_API_KEY: "test", OPENAI_MODEL: "configured-model" }).hasProviders()).toBe(true);
  });
});
