import type { ImageInput, JsonProvider, ProviderSettings } from "../types.js";
import { requiredApiKey } from "../config.js";
import { readJsonResponse, parseJsonContent } from "./openai-compatible.js";

export class GeminiProvider implements JsonProvider {
  readonly name = "gemini" as const;
  constructor(private readonly settings: ProviderSettings, private readonly timeoutMs: number) {}

  async generateJson<T>(system: string, prompt: string, image?: ImageInput, signal?: AbortSignal): Promise<T> {
    const apiKey = requiredApiKey(this.settings);
    const model = encodeURIComponent(this.settings.model);
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    const base = (this.settings.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const response = await fetch(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 1800 },
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
    });
    const payload: any = await readJsonResponse(response, this.name);
    const content = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("");
    return parseJsonContent<T>(content, this.name);
  }
}
