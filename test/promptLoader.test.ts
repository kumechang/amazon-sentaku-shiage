import { describe, it, expect } from "vitest";
import { renderPrompt } from "../src/claude/promptLoader.js";

describe("renderPrompt", () => {
  it("substitutes all placeholders", () => {
    const result = renderPrompt("A={{a}} B={{b}}", { a: "1", b: "2" });
    expect(result).toBe("A=1 B=2");
  });

  it("throws when a variable is missing", () => {
    expect(() => renderPrompt("A={{a}}", {})).toThrow(/prompt variable not provided/);
  });

  it("supports repeated placeholders", () => {
    const result = renderPrompt("{{x}}-{{x}}", { x: "v" });
    expect(result).toBe("v-v");
  });
});
