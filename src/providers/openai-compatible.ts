import type { ImageInput, JsonProvider, ProviderSettings } from "../types.js";
import { requiredApiKey } from "../config.js";

export class OpenAICompatibleProvider implements JsonProvider {
  readonly name: "openai" | "local";
  constructor(name: "openai" | "local", private readonly settings: ProviderSettings, private readonly timeoutMs: number) {
    this.name = name;
  }

  async generateJson<T>(system: string, prompt: string, image?: ImageInput, signal?: AbortSignal): Promise<T> {
    const base = (this.settings.baseUrl ?? "").replace(/\/+$/, "");
    if (!base) throw new Error(`${this.name} provider needs a baseUrl in system-one.json.`);
    const apiKey = process.env[this.settings.apiKeyEnv]?.trim() ?? "";
    if (this.name === "openai" && !apiKey) requiredApiKey(this.settings);

    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    if (image) {
      userContent.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } });
    }
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.settings.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_completion_tokens: 1800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
    });
    const payload: any = await readJsonResponse(response, this.name);
    const content = payload?.choices?.[0]?.message?.content;
    return parseJsonContent<T>(content, this.name);
  }
}

export async function readJsonResponse(response: Response, provider: string): Promise<any> {
  const text = await response.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 800) }; }
  if (!response.ok) {
    const detail = payload?.error?.message ?? payload?.message ?? payload?.raw ?? `HTTP ${response.status}`;
    throw new Error(`${provider} request failed (${response.status}): ${String(detail).slice(0, 700)}`);
  }
  return payload;
}

export function parseJsonContent<T>(content: unknown, provider: string): T {
  if (typeof content !== "string") throw new Error(`${provider} returned no JSON text content.`);
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(trimmed) as T; }
  catch { throw new Error(`${provider} returned invalid JSON. Try a model with JSON-output support or inspect its endpoint configuration.`); }
}
