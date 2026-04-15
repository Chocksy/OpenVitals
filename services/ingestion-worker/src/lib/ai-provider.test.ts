import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectProvider,
  getModel,
  getModelId,
  getOpenRouterHeaders,
} from "./ai-provider";

describe("ai-provider", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore all env vars
    process.env = { ...originalEnv };
  });

  describe("detectProvider", () => {
    beforeEach(() => {
      delete process.env.AI_PROVIDER;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.AI_GATEWAY_API_KEY;
    });

    it("uses explicit AI_PROVIDER when set", () => {
      process.env.AI_PROVIDER = "gateway";
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      expect(detectProvider()).toBe("gateway");
    });

    it("auto-detects openrouter when OPENROUTER_API_KEY is set", () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      expect(detectProvider()).toBe("openrouter");
    });

    it("falls back to gateway when no keys are set", () => {
      expect(detectProvider()).toBe("gateway");
    });

    it("respects AI_PROVIDER=openrouter even without OPENROUTER_API_KEY", () => {
      process.env.AI_PROVIDER = "openrouter";
      expect(detectProvider()).toBe("openrouter");
    });
  });

  describe("getModelId", () => {
    beforeEach(() => {
      delete process.env.AI_DEFAULT_MODEL;
    });

    it("returns AI_DEFAULT_MODEL when set", () => {
      process.env.AI_DEFAULT_MODEL = "x-ai/grok-4.20";
      expect(getModelId()).toBe("x-ai/grok-4.20");
    });

    it("returns default claude model when not set", () => {
      expect(getModelId()).toContain("anthropic/claude");
    });
  });

  describe("getOpenRouterHeaders", () => {
    beforeEach(() => {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.AI_GATEWAY_API_KEY;
    });

    it("uses OPENROUTER_API_KEY when available", () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test-123";
      const headers = getOpenRouterHeaders();
      expect(headers.Authorization).toBe("Bearer sk-or-test-123");
    });

    it("falls back to AI_GATEWAY_API_KEY", () => {
      process.env.AI_GATEWAY_API_KEY = "gw-key-456";
      const headers = getOpenRouterHeaders();
      expect(headers.Authorization).toBe("Bearer gw-key-456");
    });

    it("returns empty bearer when no keys are set", () => {
      const headers = getOpenRouterHeaders();
      expect(headers.Authorization).toBe("Bearer ");
    });
  });

  describe("getModel", () => {
    beforeEach(() => {
      delete process.env.AI_PROVIDER;
      delete process.env.OPENROUTER_API_KEY;
    });

    it("returns an OpenRouter model when OPENROUTER_API_KEY is set", () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      const model = getModel("anthropic/claude-sonnet-4-20250514");
      // OpenRouter model has a provider property
      expect(model).toBeDefined();
      expect(model.modelId).toContain("claude");
    });

    it("returns a model with the correct modelId", () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      const model = getModel("x-ai/grok-4.20");
      expect(model.modelId).toContain("grok");
    });
  });
});
