import { describe, it, expect } from "vitest";
import { getJstHour, isWithinPostingWindow } from "../src/lib/postingWindow.js";
import type { AppConfig } from "../src/config/types.js";

describe("getJstHour", () => {
  it("returns the correct hour for various JST times, including midnight", () => {
    expect(getJstHour(new Date("2026-08-29T15:02:34Z"))).toBe(0); // JST 00:02
    expect(getJstHour(new Date("2026-08-29T01:00:00Z"))).toBe(10); // JST 10:00
    expect(getJstHour(new Date("2026-08-29T14:59:00Z"))).toBe(23); // JST 23:59
  });
});

describe("isWithinPostingWindow", () => {
  const config = { postingWindow: { startHour: 7, endHour: 23 } } as AppConfig;

  it("rejects times outside the natural posting window (deep night)", () => {
    expect(isWithinPostingWindow(new Date("2026-08-29T15:02:34Z"), config)).toBe(false); // JST 0:02
  });

  it("accepts times inside the window", () => {
    expect(isWithinPostingWindow(new Date("2026-08-29T01:13:00Z"), config)).toBe(true); // JST 10:13
  });

  it("treats the boundary hours correctly (start inclusive, end exclusive)", () => {
    expect(isWithinPostingWindow(new Date("2026-08-28T22:00:00Z"), config)).toBe(true); // JST 7:00
    expect(isWithinPostingWindow(new Date("2026-08-29T14:00:00Z"), config)).toBe(false); // JST 23:00
  });
});
