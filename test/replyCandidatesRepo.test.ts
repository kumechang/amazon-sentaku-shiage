import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";
import {
  createReplyCandidate,
  getByTargetTweetId,
  countRepliesCreatedOnJstDate,
  getLastReplyCreatedAt,
  countMentionRepliesCreatedOnJstDate,
  getLastMentionTargetTweetId,
  markRejected,
  markApproved,
  listRecentReplyRejectionFeedback,
  listKeywordOutcomeStats,
} from "../src/db/repositories/replyCandidatesRepo.js";
import { getJstDateString } from "../src/lib/time.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const schema = readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

describe("replyCandidatesRepo", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("prevents duplicate candidates for the same target tweet via getByTargetTweetId", () => {
    expect(getByTargetTweetId(db, "1234")).toBeUndefined();

    createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: null,
      target_tweet_id: "1234",
      target_author_username: "someone",
      target_text: "洗濯物が全然乾かない",
      target_follower_count: 100,
      reply_text: "わかる、この時期ほんとそう",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });

    expect(getByTargetTweetId(db, "1234")).toBeDefined();
  });

  it("only counts should_reply=true candidates toward the daily target", () => {
    createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: null,
      target_tweet_id: "1",
      target_author_username: "a",
      target_text: "text",
      target_follower_count: 100,
      reply_text: null,
      should_reply: false,
      skip_reason: "センシティブな話題",
      run_id: null,
    });
    createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: null,
      target_tweet_id: "2",
      target_author_username: "b",
      target_text: "text",
      target_follower_count: 100,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });

    const today = getJstDateString(new Date());
    expect(countRepliesCreatedOnJstDate(db, today)).toBe(1);
  });

  it("getLastReplyCreatedAt returns null when there are no should_reply=true candidates yet", () => {
    createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: null,
      target_tweet_id: "1",
      target_author_username: "a",
      target_text: "text",
      target_follower_count: 100,
      reply_text: null,
      should_reply: false,
      skip_reason: "曖昧すぎる",
      run_id: null,
    });

    expect(getLastReplyCreatedAt(db)).toBeNull();
  });

  it("countMentionRepliesCreatedOnJstDate only counts source='mention' candidates", () => {
    createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: null,
      target_tweet_id: "1",
      target_author_username: "a",
      target_text: "text",
      target_follower_count: 100,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });
    createReplyCandidate(db, {
      source: "mention",
      matched_keyword: null,
      target_tweet_id: "2",
      target_author_username: "b",
      target_text: "text",
      target_follower_count: null,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });

    const today = getJstDateString(new Date());
    expect(countMentionRepliesCreatedOnJstDate(db, today)).toBe(1);
  });

  it("getLastMentionTargetTweetId ignores non-mention sources", () => {
    expect(getLastMentionTargetTweetId(db)).toBeNull();

    createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: null,
      target_tweet_id: "keyword-1",
      target_author_username: "a",
      target_text: "text",
      target_follower_count: 100,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });
    expect(getLastMentionTargetTweetId(db)).toBeNull();

    createReplyCandidate(db, {
      source: "mention",
      matched_keyword: null,
      target_tweet_id: "mention-1",
      target_author_username: "b",
      target_text: "text",
      target_follower_count: null,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });
    expect(getLastMentionTargetTweetId(db)).toBe("mention-1");
  });

  it("listRecentReplyRejectionFeedback skips rejections without a reason and extracts reasons from ones that have them", () => {
    const bareId = createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: null,
      target_tweet_id: "1",
      target_author_username: "a",
      target_text: "text",
      target_follower_count: 100,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });
    markRejected(db, bareId, "kumechang", "却下");

    const reasonedId = createReplyCandidate(db, {
      source: "mention",
      matched_keyword: null,
      target_tweet_id: "2",
      target_author_username: "b",
      target_text: "text",
      target_follower_count: null,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });
    markRejected(db, reasonedId, "kumechang", "却下 もっとフランクな感じがいい");

    const feedback = listRecentReplyRejectionFeedback(db, 10);
    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.reason).toBe("もっとフランクな感じがいい");
    expect(feedback[0]?.targetAuthorUsername).toBe("b");
  });

  it("listKeywordOutcomeStats aggregates good/bad counts per matched keyword, ignoring non-keyword sources", () => {
    const approvedId = createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: "部屋干し",
      target_tweet_id: "1",
      target_author_username: "a",
      target_text: "text",
      target_follower_count: 100,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });
    markApproved(db, approvedId, "kumechang", "承認");

    const rejectedId = createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: "部屋干し",
      target_tweet_id: "2",
      target_author_username: "b",
      target_text: "text",
      target_follower_count: 100,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });
    markRejected(db, rejectedId, "kumechang", "却下");

    createReplyCandidate(db, {
      source: "keyword",
      matched_keyword: "柔軟剤",
      target_tweet_id: "3",
      target_author_username: "c",
      target_text: "text",
      target_follower_count: 100,
      reply_text: null,
      should_reply: false,
      skip_reason: "曖昧すぎる",
      run_id: null,
    });

    createReplyCandidate(db, {
      source: "mention",
      matched_keyword: null,
      target_tweet_id: "4",
      target_author_username: "d",
      target_text: "text",
      target_follower_count: null,
      reply_text: "reply",
      should_reply: true,
      skip_reason: null,
      run_id: null,
    });

    const stats = listKeywordOutcomeStats(db);
    expect(stats).toHaveLength(2);
    const byKeyword = Object.fromEntries(stats.map((s) => [s.keyword, s]));
    expect(byKeyword["部屋干し"]).toEqual({ keyword: "部屋干し", goodCount: 1, badCount: 1 });
    expect(byKeyword["柔軟剤"]).toEqual({ keyword: "柔軟剤", goodCount: 0, badCount: 1 });
  });
});
