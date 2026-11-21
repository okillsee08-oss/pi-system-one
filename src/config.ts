import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { ProviderName, ProviderSettings, SystemOneConfig } from "./types.js";

const DEFAULTS: SystemOneConfig = {
  provider: "gemini",
  providers: {
    openai: { model: "gpt-4.1-mini", apiKeyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
    gemini: { model: "gemini-4-hydrogen", apiKeyEnv: "GEMINI_API_KEY" },
    jev: { model: "jev-1.14.0", apiKeyEnv: "TYPESAFE_API_KEY", baseUrl: "https://api.typesafe.ai/v1/systemone" },
    local: { model: "qwen2.5-vl-7b-instruct", apiKeyEnv: "LOCAL_MODEL_API_KEY", baseUrl: "http://127.0.0.1:1234/v1" },
  },
  computerUse: {
    enabled: true,
    python: process.platform === "win32" ? "python" : "python3",
    maxActions: 15,
    confirmEveryAction: true,
    screenshotMaxSide: 1568,
  },
  mcpServers: {},
  requestTimeoutMs: 90_000,
  mcpMaxCalls: 6,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeSettings(base: ProviderSettings, incoming: unknown): ProviderSettings {
  if (!isRecord(incoming)) return { ...base };
  return {
    model: typeof incoming.model === "string" && incoming.model.trim() ? incoming.model.trim() : base.model,
    apiKeyEnv: typeof incoming.apiKeyEnv === "string" && incoming.apiKeyEnv.trim() ? incoming.apiKeyEnv.trim() : base.apiKeyEnv,
    baseUrl: typeof incoming.baseUrl === "string" && incoming.baseUrl.trim() ? incoming.baseUrl.trim() : base.baseUrl,
  };
}

export function configPath(): string {
  return resolve(process.env.PI_SYSTEM_ONE_CONFIG || join(homedir(), ".pi", "agent", "system-one.json"));
}

export function loadConfig(path = configPath()): SystemOneConfig {
  let raw: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (!isRecord(parsed)) throw new Error("Config root must be a JSON object.");
      raw = parsed;
    } catch (error) {
      throw new Error(`Could not read System One config at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const provider = (raw.provider ?? DEFAULTS.provider) as ProviderName;
  if (!["openai", "gemini", "jev", "local"].includes(provider)) {
    throw new Error(`Unknown System One provider "${String(provider)}". Use openai, gemini, jev, or local.`);
  }

  const rawProviders = isRecord(raw.providers) ? raw.providers : {};
  const providers = {} as Record<ProviderName, ProviderSettings>;
  for (const name of ["openai", "gemini", "jev", "local"] as const) {
    providers[name] = mergeSettings(DEFAULTS.providers[name], rawProviders[name]);
  }

  const rawComputer = isRecord(raw.computerUse) ? raw.computerUse : {};
  const computerUse = {
    enabled: typeof rawComputer.enabled === "boolean" ? rawComputer.enabled : DEFAULTS.computerUse.enabled,
    python: typeof rawComputer.python === "string" && rawComputer.python.trim() ? rawComputer.python : DEFAULTS.computerUse.python,
    maxActions: clampInt(rawComputer.maxActions, 1, 30, DEFAULTS.computerUse.maxActions),
    confirmEveryAction: typeof rawComputer.confirmEveryAction === "boolean" ? rawComputer.confirmEveryAction : DEFAULTS.computerUse.confirmEveryAction,
    screenshotMaxSide: clampInt(rawComputer.screenshotMaxSide, 320, 2048, DEFAULTS.computerUse.screenshotMaxSide),
  };

  const mcpServers = isRecord(raw.mcpServers) ? raw.mcpServers as SystemOneConfig["mcpServers"] : {};
  for (const [name, server] of Object.entries(mcpServers)) {
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(name) || !isRecord(server)) {
      throw new Error(`Invalid MCP server entry: ${name}`);
    }
    if (!Array.isArray(server.allowedTools) || server.allowedTools.length === 0 || server.allowedTools.some((item) => typeof item !== "string" || !item.trim() || item === "*")) {
      throw new Error(`MCP server "${name}" must define a non-empty explicit allowedTools list. Wildcards are not supported.`);
    }
    if (server.transport === "stdio") {
      if (typeof server.command !== "string" || !server.command.trim()) throw new Error(`MCP stdio server "${name}" needs a command.`);
      if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some((item) => typeof item !== "string"))) {
        throw new Error(`MCP stdio server "${name}" args must be a string array.`);
      }
      if (server.env !== undefined && (!isRecord(server.env) || Object.values(server.env).some((item) => typeof item !== "string"))) {
        throw new Error(`MCP stdio server "${name}" env must be a string map.`);
      }
    } else if (server.transport === "http") {
      if (typeof server.url !== "string") throw new Error(`MCP HTTP server "${name}" needs a URL.`);
      let parsed: URL;
      try { parsed = new URL(server.url); } catch { throw new Error(`MCP HTTP server "${name}" has an invalid URL.`); }
      if (!["https:", "http:"].includes(parsed.protocol)) throw new Error(`MCP HTTP server "${name}" must use HTTP or HTTPS.`);
    } else {
      throw new Error(`MCP server "${name}" transport must be either stdio or http.`);
    }
  }

  return {
    provider,
    providers,
    computerUse,
    mcpServers,
    requestTimeoutMs: clampInt(raw.requestTimeoutMs, 5_000, 300_000, DEFAULTS.requestTimeoutMs),
    mcpMaxCalls: clampInt(raw.mcpMaxCalls, 1, 12, DEFAULTS.mcpMaxCalls),
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function resolveProviderName(override: unknown, config: SystemOneConfig): ProviderName {
  const value = override ?? config.provider;
  if (typeof value !== "string" || !["openai", "gemini", "jev", "local"].includes(value)) {
    throw new Error(`Invalid provider "${String(value)}". Choose openai, gemini, jev, or local.`);
  }
  return value as ProviderName;
}

/** Expand only explicit ${ENV_NAME} references. Never log resolved values. */
export function expandEnvReferences(input: string, env = process.env): string {
  return input.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, key: string) => env[key] ?? "");
}

export function requiredApiKey(settings: ProviderSettings): string {
  const key = process.env[settings.apiKeyEnv]?.trim();
  if (!key && settings.apiKeyEnv) {
    throw new Error(`Missing ${settings.apiKeyEnv}. Set it in your environment; provider keys are not stored in system-one.json.`);
  }
  return key ?? "";
}
