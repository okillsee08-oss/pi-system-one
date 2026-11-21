import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ComputerAction, ImageInput, SystemOneConfig } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE = resolve(HERE, "../python/bridge.py");
const ALLOWED_KEYS = new Set(["ENTER", "TAB", "ESC", "BACKSPACE", "DELETE", "SPACE", "UP", "DOWN", "LEFT", "RIGHT"]);

export interface ScreenCapture {
  image: ImageInput;
  width: number;
  height: number;
}

interface BridgeResponse {
  ok: boolean;
  error?: string;
  image_base64?: string;
  width?: number;
  height?: number;
}

export class PythonComputerBridge {
  constructor(private readonly config: SystemOneConfig) {}

  async capture(): Promise<ScreenCapture> {
    const result = await this.call({ action: "capture", max_side: this.config.computerUse.screenshotMaxSide });
    if (!result.image_base64 || !result.width || !result.height) throw new Error("Computer bridge returned an invalid screenshot.");
    return {
      image: { mimeType: "image/jpeg", base64: result.image_base64 },
      width: result.width,
      height: result.height,
    };
  }

  async execute(action: ComputerAction): Promise<void> {
    switch (action.action) {
      case "click":
      case "double_click":
        requireNormalizedPoint(action.x, action.y);
        await this.call({ action: action.action, x: action.x, y: action.y });
        return;
      case "type":
        requireNormalizedPoint(action.x, action.y);
        if (typeof action.text !== "string" || action.text.length < 1 || action.text.length > 500) {
          throw new Error("Refusing an empty or oversized typing action (limit: 500 characters).");
        }
        await this.call({ action: "type", x: action.x, y: action.y, text: action.text });
        return;
      case "press":
        if (!action.key || !ALLOWED_KEYS.has(action.key.toUpperCase())) throw new Error("Key is not on the System One keyboard allowlist.");
        await this.call({ action: "press", key: action.key.toUpperCase() });
        return;
      case "scroll":
        if (action.direction !== "up" && action.direction !== "down") throw new Error("Scroll direction must be up or down.");
        await this.call({ action: "scroll", direction: action.direction, amount: Math.max(1, Math.min(8, Math.round(action.amount ?? 3))) });
        return;
      case "wait":
        await this.call({ action: "wait" });
        return;
      case "open_url":
        validateHttpUrl(action.url);
        await this.call({ action: "open_url", url: action.url });
        return;
      case "done":
        return;
      default: {
        const exhaustive: never = action.action;
        throw new Error(`Unsupported computer action: ${String(exhaustive)}`);
      }
    }
  }

  private async call(payload: Record<string, unknown>): Promise<BridgeResponse> {
    const python = this.config.computerUse.python;
    return new Promise((resolvePromise, reject) => {
      const child = spawn(python, [BRIDGE], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let size = 0;
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Computer bridge timed out. Check Python and desktop accessibility/screen-recording permissions."));
      }, 20_000);
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 15 * 1024 * 1024) {
          child.kill("SIGKILL");
          reject(new Error("Computer bridge response exceeded 15 MB."));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => { if (Buffer.concat(stderr).length < 16_000) stderr.push(chunk); });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Could not start Python bridge (${python}): ${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        const output = Buffer.concat(stdout).toString("utf8").trim();
        if (code !== 0 || !output) {
          const details = Buffer.concat(stderr).toString("utf8").trim();
          reject(new Error(details || `Python bridge exited with code ${code}. Install python/requirements.txt first.`));
          return;
        }
        try {
          const result = JSON.parse(output) as BridgeResponse;
          if (!result.ok) reject(new Error(result.error || "Computer bridge operation failed."));
          else resolvePromise(result);
        } catch {
          reject(new Error(`Python bridge returned malformed JSON: ${output.slice(0, 500)}`));
        }
      });
      child.stdin.end(`${JSON.stringify(payload)}\n`);
    });
  }
}

function requireNormalizedPoint(x: unknown, y: unknown): asserts x is number {
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error("Click coordinates must be normalized numbers between 0 and 1.");
  }
}

function validateHttpUrl(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Invalid URL.");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Invalid URL."); }
  if (!(["http:", "https:"].includes(parsed.protocol)) || parsed.username || parsed.password) {
    throw new Error("Only public HTTP and HTTPS URLs without embedded credentials are allowed.");
  }
}

export function validateComputerAction(value: unknown): ComputerAction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("System One returned an invalid action object.");
  const input = value as Record<string, unknown>;
  const actions: ComputerAction["action"][] = ["click", "double_click", "type", "press", "scroll", "wait", "open_url", "done"];
  if (!actions.includes(input.action as ComputerAction["action"])) throw new Error("System One requested an action outside the execution allowlist.");
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence)) : 0;
  const result: ComputerAction = {
    action: input.action as ComputerAction["action"],
    reason: typeof input.reason === "string" ? input.reason.slice(0, 400) : "No reason supplied",
    confidence,
  };
  if (input.x !== undefined) result.x = Number(input.x);
  if (input.y !== undefined) result.y = Number(input.y);
  if (input.text !== undefined) result.text = String(input.text);
  if (input.key !== undefined) result.key = String(input.key).toUpperCase();
  if (input.direction === "up" || input.direction === "down") result.direction = input.direction;
  if (input.amount !== undefined) result.amount = Number(input.amount);
  if (input.url !== undefined) result.url = String(input.url);
  if (["click", "double_click"].includes(result.action)) requireNormalizedPoint(result.x, result.y);
  if (result.action === "type") {
    requireNormalizedPoint(result.x, result.y);
    if (typeof result.text !== "string" || !result.text.length || result.text.length > 500) throw new Error("System One requested invalid text input.");
  }
  if (result.action === "press" && (!result.key || !ALLOWED_KEYS.has(result.key))) throw new Error("System One requested a disallowed key press.");
  if (result.action === "scroll" && !result.direction) throw new Error("System One requested invalid scroll direction.");
  if (result.action === "open_url") validateHttpUrl(result.url);
  return result;
}

export function needsComputerApproval(action: ComputerAction, confirmEveryAction: boolean): boolean {
  if (["done", "wait", "scroll"].includes(action.action)) return false;
  return confirmEveryAction || ["type", "press", "open_url", "double_click"].includes(action.action);
}
