import type { ProviderName, SystemOneConfig, JsonProvider } from "../types.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { JevProvider } from "./jev.js";

export type AnyProvider = JsonProvider | JevProvider;

export function createProvider(name: ProviderName, config: SystemOneConfig): AnyProvider {
  const settings = config.providers[name];
  switch (name) {
    case "openai": return new OpenAICompatibleProvider("openai", settings, config.requestTimeoutMs);
    case "local": return new OpenAICompatibleProvider("local", settings, config.requestTimeoutMs);
    case "gemini": return new GeminiProvider(settings, config.requestTimeoutMs);
    case "jev": return new JevProvider(settings, config.requestTimeoutMs);
  }
}

export function requireJsonProvider(provider: AnyProvider): JsonProvider {
  if (provider.name === "jev") {
    throw new Error("JEV uses a constrained choice/box interface. Use it for decision choices or computer use; use OpenAI, Gemini, or a local model for general MCP tool-argument planning.");
  }
  return provider;
}
