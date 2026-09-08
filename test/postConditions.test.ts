import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";
import { getSeasonLabel, getJstMonth, buildPostConditions } from "../src/context/postConditions.js";
import { createPost, markApproved } from "../src/db/repositories/postsRepo.js";
import type { AppConfig } from "../src/config/types.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const schema = readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

function insertApprovedPost(db: Database.Database, postType: string): void {
  const id = createPost(db, {
    platform: "X",
    product_id: null,
    post_type: postType,
    product_usage: "none",
    strategy_json: "{}",
    generated_text: "text",
    selfcheck_json: "{}",
    final_text: "text",
    self_check_score: 90,
    self_check_pass: true,
    run_id: null,
    reply_kind: null,
    tip_text: null,
    tip_poll_options: null,
    tip_selfcheck_json: null,
    tip_self_check_score: null,
    tip_self_check_pass: null,
  });
  markApproved(db, id, "tester", "承認");
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    approvalMode: "manual",
    postApprovalMode: "manual",
    claudeModel: "claude-sonnet-5",
    selfCheckPassThreshold: 75,
    platform: "X",
    xCharLimit: 280,
    targetProductRatio: { review: 0.1, sale: 0.05 },
    recentPostsWindow: 10,
    postingWindow: { startHour: 7, endHour: 23 },
    targetPostsPerDay: 4,
    minSpacingHours: 2,
    postHashtags: [],
    targetProblemRatio: 0.6,
    pollReplyRatio: 0.2,
    pollDurationMinutes: 1440,
    replySettings: {
      targetRepliesPerDay: 10,
      minSpacingHours: 1,
      minFollowers: 50,
      maxFollowers: 50000,
      keywords: [],
      candidateExpiryHours: 48,
    },
    mentionReplySettings: { maxRepliesPerRun: 5, maxRepliesPerDay: 5 },
    ...overrides,
  };
}

describe("getJstMonth", () => {
  it("returns the correct numeric month for a JST date (regression: ja-JP format() included '月' and broke Number())", () => {
    expect(getJstMonth(new Date("2026-08-29T01:00:00Z"))).toBe(8);
    expect(getJstMonth(new Date("2026-01-01T20:00:00Z"))).toBe(1); // UTC 20:00 = JST 翌日05:00(月は変わらない)
    expect(getJstMonth(new Date("2026-12-31T10:00:00Z"))).toBe(12);
  });
});

describe("getSeasonLabel", () => {
  it("maps each month to the correct season", () => {
    expect(getSeasonLabel(8)).toBe("夏(梅雨〜盛夏)");
    expect(getSeasonLabel(4)).toBe("春");
    expect(getSeasonLabel(10)).toBe("秋");
    expect(getSeasonLabel(1)).toBe("冬");
    expect(getSeasonLabel(12)).toBe("冬");
  });
});

describe("buildPostConditions problem-type hint", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("adds a hint when the recent problem ratio is below the target", () => {
    insertApprovedPost(db, "emotion");
    insertApprovedPost(db, "daily");

    const conditions = buildPostConditions(db, baseConfig({ targetProblemRatio: 0.6 }));
    expect(conditions).toContain('post_typeを"problem"にすることを検討してください');
  });

  it("adds no hint when the recent problem ratio already meets the target", () => {
    insertApprovedPost(db, "problem");
    insertApprovedPost(db, "problem");
    insertApprovedPost(db, "emotion");

    const conditions = buildPostConditions(db, baseConfig({ targetProblemRatio: 0.6 }));
    expect(conditions).not.toContain("problemタイプ");
  });

  it("adds no hint when there is no post history yet", () => {
    const conditions = buildPostConditions(db, baseConfig({ targetProblemRatio: 0.6 }));
    expect(conditions).not.toContain("problemタイプ");
  });
});
