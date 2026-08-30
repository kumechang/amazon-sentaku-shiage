import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";
import {
  createReplyCandidate,
  getByTargetTweetId,
  countRepliesCreatedOnJstDate,
  getLastReplyCreatedAt,
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
});
