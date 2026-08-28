import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const callClaudeMock = vi.fn();
vi.mock("../src/claude/client.js", () => ({
  callClaude: (...args: unknown[]) => callClaudeMock(...args),
}));

const { callClaudeJson } = await import("../src/claude/jsonRetry.js");

const schema = z.object({ ok: z.boolean() });

beforeEach(() => {
  callClaudeMock.mockReset();
});

describe("callClaudeJson", () => {
  it("parses valid JSON on the first attempt", async () => {
    callClaudeMock.mockResolvedValueOnce('{"ok": true}');
    const result = await callClaudeJson("model", "prompt", schema);
    expect(result.data).toEqual({ ok: true });
    expect(callClaudeMock).toHaveBeenCalledTimes(1);
  });

  it("extracts JSON even when wrapped in extra text", async () => {
    callClaudeMock.mockResolvedValueOnce('ここに結果:\n{"ok": true}\nおわり');
    const result = await callClaudeJson("model", "prompt", schema);
    expect(result.data).toEqual({ ok: true });
  });

  it("retries once with a stricter reminder on invalid JSON", async () => {
    callClaudeMock.mockResolvedValueOnce("not json at all");
    callClaudeMock.mockResolvedValueOnce('{"ok": false}');
    const result = await callClaudeJson("model", "prompt", schema);
    expect(result.data).toEqual({ ok: false });
    expect(callClaudeMock).toHaveBeenCalledTimes(2);
    expect(callClaudeMock.mock.calls[1]?.[1]).toContain("重要");
  });

  it("throws after both attempts fail", async () => {
    callClaudeMock.mockResolvedValueOnce("nope");
    callClaudeMock.mockResolvedValueOnce("still nope");
    await expect(callClaudeJson("model", "prompt", schema)).rejects.toThrow();
  });
});
