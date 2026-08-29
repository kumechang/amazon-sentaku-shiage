import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";
import { extractRejectionReason, listRecentRejectionFeedback } from "../src/db/repositories/postsRepo.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const schema = readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

function insertRejectedPost(
  db: Database.Database,
  opts: { createdAt: string; postType: string; theme: string; approvalCommentBody: string | null }
): void {
  db.prepare(
    `INSERT INTO posts (platform, post_type, strategy_json, generated_text, selfcheck_json, final_text, status, approval_comment_body, created_at)
     VALUES ('X', ?, ?, 'text', '{}', 'text', 'rejected', ?, ?)`
  ).run(opts.postType, JSON.stringify({ theme: opts.theme }), opts.approvalCommentBody, opts.createdAt);
}

describe("extractRejectionReason", () => {
  it("returns null when the comment is just the keyword", () => {
    expect(extractRejectionReason("却下")).toBeNull();
  });

  it("returns the remaining text as the reason", () => {
    expect(extractRejectionReason("却下 もう少し日常的な感じがいい")).toBe("もう少し日常的な感じがいい");
  });

  it("strips the keyword wherever it appears", () => {
    expect(extractRejectionReason("これは却下、広告っぽすぎる")).toBe("これは、広告っぽすぎる");
  });
});

describe("listRecentRejectionFeedback", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("skips rejections without a reason", () => {
    insertRejectedPost(db, { createdAt: "2026-08-01T00:00:00Z", postType: "emotion", theme: "香り", approvalCommentBody: "却下" });
    expect(listRecentRejectionFeedback(db, 10)).toEqual([]);
  });

  it("includes rejections with a reason, newest first", () => {
    insertRejectedPost(db, {
      createdAt: "2026-08-01T00:00:00Z",
      postType: "emotion",
      theme: "香り",
      approvalCommentBody: "却下 広告っぽい",
    });
    insertRejectedPost(db, {
      createdAt: "2026-08-02T00:00:00Z",
      postType: "daily",
      theme: "部屋干し",
      approvalCommentBody: "却下 もう少し日常的な感じがいい",
    });

    const feedback = listRecentRejectionFeedback(db, 10);
    expect(feedback).toHaveLength(2);
    expect(feedback[0]?.reason).toBe("もう少し日常的な感じがいい");
    expect(feedback[0]?.postType).toBe("daily");
    expect(feedback[1]?.reason).toBe("広告っぽい");
  });
});
