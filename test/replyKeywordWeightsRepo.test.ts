import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";
import { getWeight, getAverageWeight, upsertWeights } from "../src/db/repositories/replyKeywordWeightsRepo.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const schema = readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

describe("replyKeywordWeightsRepo", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("getWeight returns the default (1.0) for an unanalyzed keyword", () => {
    expect(getWeight(db, "部屋干し")).toBe(1.0);
  });

  it("getAverageWeight returns the default when nothing has been analyzed yet", () => {
    expect(getAverageWeight(db)).toBe(1.0);
  });

  it("upsertWeights inserts new rows and updates existing ones on conflict", () => {
    upsertWeights(db, [
      { keyword: "部屋干し", weight: 2.0, reason: "承認率が高い" },
      { keyword: "柔軟剤", weight: 0.5, reason: "却下が多い" },
    ]);

    expect(getWeight(db, "部屋干し")).toBe(2.0);
    expect(getWeight(db, "柔軟剤")).toBe(0.5);
    expect(getAverageWeight(db)).toBeCloseTo(1.25);

    upsertWeights(db, [{ keyword: "部屋干し", weight: 3.0, reason: "さらに改善" }]);
    expect(getWeight(db, "部屋干し")).toBe(3.0);
  });
});
