import { describe, it, expect } from "vitest";
import { buildReplyIssueTitle, buildReplyIssueBody } from "../src/github/createReplyApprovalIssue.js";

function baseContent(overrides: Partial<Parameters<typeof buildReplyIssueTitle>[0]> = {}) {
  return {
    targetAuthorUsername: "yauyuism",
    targetTweetId: "123",
    targetText: "今日は部屋干しで生乾き臭がひどい",
    replyText: "わかる、この時期ほんとそう",
    reason: "共感できる悩み投稿だったため",
    ...overrides,
  };
}

describe("buildReplyIssueTitle", () => {
  it("includes the target post text, not just the username (title-only notification previews need this)", () => {
    const title = buildReplyIssueTitle(baseContent());
    expect(title).toBe("返信承認: @yauyuism 「今日は部屋干しで生乾き臭がひどい」");
  });

  it("truncates a long post and collapses newlines/whitespace into single spaces", () => {
    const title = buildReplyIssueTitle(
      baseContent({ targetText: "これはとても長い投稿本文です。\n改行や　　連続する空白を含みつつ30文字を超えるように書いています。" })
    );
    expect(title).toContain("…");
    expect(title).not.toContain("\n");
    expect(title).not.toMatch(/ {2,}/);
  });
});

describe("buildReplyIssueBody", () => {
  it("includes the full (untruncated) target post text", () => {
    const longText = "これはとても長い投稿本文です。".repeat(5);
    const body = buildReplyIssueBody(baseContent({ targetText: longText }));
    expect(body).toContain(longText);
  });
});
