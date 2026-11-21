import { describe, expect, it } from "vitest";
import { loadConfig, resolveProviderName, expandEnvReferences } from "../src/config.js";
import { validateComputerAction, needsComputerApproval } from "../src/computer.js";

const baseConfig = () => loadConfig("/definitely/not/a/config/file.json");

describe("configuration", () => {
  it("provides safe defaults and starts with one selected provider", () => {
    const config = baseConfig();
    expect(config.provider).toBe("gemini");
    expect(config.computerUse.confirmEveryAction).toBe(true);
    expect(config.mcpServers).toEqual({});
  });

  it("rejects unknown providers", () => {
    expect(() => resolveProviderName("unknown", baseConfig())).toThrow(/Invalid provider/);
  });

  it("expands environment references without exposing a fallback secret", () => {
    expect(expandEnvReferences("Bearer ${TOKEN} / ${MISSING}", { TOKEN: "abc" })).toBe("Bearer abc / ");
  });
});

describe("computer action boundary", () => {
  it("accepts a normalized click", () => {
    expect(validateComputerAction({ action: "click", x: 0.4, y: 0.6, reason: "Open menu", confidence: 0.8 }).action).toBe("click");
  });

  it("rejects out-of-range click coordinates", () => {
    expect(() => validateComputerAction({ action: "click", x: 3, y: 0.5, reason: "bad", confidence: 1 })).toThrow(/normalized/);
  });

  it("rejects arbitrary key combinations", () => {
    expect(() => validateComputerAction({ action: "press", key: "CTRL+ALT+DELETE", reason: "bad", confidence: 1 })).toThrow(/disallowed/);
  });

  it("refuses non-http URLs", () => {
    expect(() => validateComputerAction({ action: "open_url", url: "file:///etc/passwd", reason: "bad", confidence: 1 })).toThrow(/HTTP/);
  });

  it("confirms interactive actions by default", () => {
    const click = validateComputerAction({ action: "click", x: 0.5, y: 0.5, reason: "button", confidence: 1 });
    const scroll = validateComputerAction({ action: "scroll", direction: "down", reason: "page", confidence: 1 });
    expect(needsComputerApproval(click, true)).toBe(true);
    expect(needsComputerApproval(scroll, true)).toBe(false);
  });
});
