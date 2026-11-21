export type ProviderName = "openai" | "gemini" | "jev" | "local";

export interface ProviderSettings {
  model: string;
  apiKeyEnv: string;
  baseUrl?: string;
}

export interface McpStdioServerConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  cwd?: string;
  /** Values may use ${ENV_VAR}; secrets should never be written literally here. */
  env?: Record<string, string>;
  allowedTools: string[];
}

export interface McpHttpServerConfig {
  transport: "http";
  url: string;
  /** Header values may use ${ENV_VAR}; secrets should never be written literally here. */
  headers?: Record<string, string>;
  allowedTools: string[];
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

export interface SystemOneConfig {
  provider: ProviderName;
  providers: Record<ProviderName, ProviderSettings>;
  computerUse: {
    enabled: boolean;
    python: string;
    maxActions: number;
    confirmEveryAction: boolean;
    screenshotMaxSide: number;
  };
  mcpServers: Record<string, McpServerConfig>;
  requestTimeoutMs: number;
  mcpMaxCalls: number;
}

export interface ImageInput {
  mimeType: "image/png" | "image/jpeg";
  base64: string;
}

export interface JsonProvider {
  readonly name: ProviderName;
  generateJson<T>(system: string, prompt: string, image?: ImageInput): Promise<T>;
}

export interface DecisionResult {
  recommendation: string;
  rationale: string;
  risks: string[];
  confidence: number;
}

export type ComputerActionName = "click" | "double_click" | "type" | "press" | "scroll" | "wait" | "open_url" | "done";

export interface ComputerAction {
  action: ComputerActionName;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  direction?: "up" | "down";
  amount?: number;
  url?: string;
  reason: string;
  confidence: number;
}

export interface McpAgentDecision {
  done: boolean;
  toolName?: string;
  arguments?: Record<string, unknown>;
  summary: string;
}
