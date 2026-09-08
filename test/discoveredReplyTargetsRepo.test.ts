import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";
import { insertDiscovered, listBySource, remove, countAll } from "../src/db/repositories/discoveredReplyTargetsRepo.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const schema = readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

describe("discoveredReplyTargetsRepo", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("insertDiscovered adds a new row and reports success", () => {
    const added = insertDiscovered(db, {
      source: "watched_account",
      matched_keyword: null,
      tweet_id: "1",
      author_username: "someone",
      text: "洗濯物が全然乾かない",
      follower_count: 20000,
    });

    expect(added).toBe(true);
    expect(countAll(db)).toBe(1);
  });

  it("insertDiscovered ignores duplicate tweet_id and reports no change", () => {
    insertDiscovered(db, {
      source: "keyword",
      matched_keyword: "部屋干し",
      tweet_id: "1",
      author_username: "a",
      text: "text",
      follower_count: 100,
    });

    const addedAgain = insertDiscovered(db, {
      source: "keyword",
      matched_keyword: "部屋干し",
      tweet_id: "1",
      author_username: "a",
      text: "text (別の検索でヒット)",
      follower_count: 100,
    });

    expect(addedAgain).toBe(false);
    expect(countAll(db)).toBe(1);
  });

  it("listBySource returns only rows for the given source, oldest first", () => {
    insertDiscovered(db, {
      source: "keyword",
      matched_keyword: "柔軟剤",
      tweet_id: "k1",
      author_username: "a",
      text: "text",
      follower_count: 100,
    });
    insertDiscovered(db, {
      source: "watched_account",
      matched_keyword: null,
      tweet_id: "w1",
      author_username: "b",
      text: "text",
      follower_count: 20000,
    });
    insertDiscovered(db, {
      source: "watched_account",
      matched_keyword: null,
      tweet_id: "w2",
      author_username: "c",
      text: "text",
      follower_count: 30000,
    });

    const watched = listBySource(db, "watched_account");
    expect(watched.map((row) => row.tweet_id)).toEqual(["w1", "w2"]);

    const keyword = listBySource(db, "keyword");
    expect(keyword.map((row) => row.tweet_id)).toEqual(["k1"]);
  });

  it("remove deletes the row so it no longer appears in listBySource", () => {
    const id = insertDiscoveredAndGetId(db, {
      source: "keyword",
      matched_keyword: null,
      tweet_id: "1",
      author_username: "a",
      text: "text",
      follower_count: 100,
    });

    remove(db, id);

    expect(listBySource(db, "keyword")).toHaveLength(0);
    expect(countAll(db)).toBe(0);
  });
});

function insertDiscoveredAndGetId(
  db: Database.Database,
  input: Parameters<typeof insertDiscovered>[1]
): number {
  insertDiscovered(db, input);
  const row = listBySource(db, input.source)[0];
  if (!row) throw new Error("expected row to exist after insertDiscovered");
  return row.id;
}
