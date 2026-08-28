import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";
import { upsertProduct } from "../src/db/repositories/productsRepo.js";
import { selectProduct } from "../src/context/productSelector.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const schema = readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

function insertPost(db: Database.Database, productId: number, createdAt: string): void {
  db.prepare(
    `INSERT INTO posts (platform, product_id, product_usage, strategy_json, generated_text, selfcheck_json, final_text, status, created_at)
     VALUES ('X', ?, 'natural', '{}', 'text', '{}', 'text', 'posted', ?)`
  ).run(productId, createdAt);
}

describe("selectProduct", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns the no-product sentinel when there are no active products", () => {
    const result = selectProduct(db);
    expect(result.productId).toBeNull();
    expect(result.productInfoText).toContain("ありません");
  });

  it("prefers a never-used product over a recently-used one", () => {
    upsertProduct(db, {
      asin: "USED",
      name: "使用済み商品",
      affiliate_url: "https://example.com/used",
      active: true,
    });
    upsertProduct(db, {
      asin: "FRESH",
      name: "未使用商品",
      affiliate_url: "https://example.com/fresh",
      active: true,
    });

    const used = db.prepare("SELECT id FROM products WHERE asin = 'USED'").get() as { id: number };
    insertPost(db, used.id, "2026-08-01T00:00:00Z");

    const result = selectProduct(db);
    expect(result.productInfoText).toContain("未使用商品");
  });

  it("prefers the least-recently-used product among used ones", () => {
    upsertProduct(db, { asin: "OLD", name: "古い商品", affiliate_url: "https://example.com/old", active: true });
    upsertProduct(db, { asin: "NEW", name: "新しい商品", affiliate_url: "https://example.com/new", active: true });

    const oldProduct = db.prepare("SELECT id FROM products WHERE asin = 'OLD'").get() as { id: number };
    const newProduct = db.prepare("SELECT id FROM products WHERE asin = 'NEW'").get() as { id: number };
    insertPost(db, oldProduct.id, "2026-01-01T00:00:00Z");
    insertPost(db, newProduct.id, "2026-08-01T00:00:00Z");

    const result = selectProduct(db);
    expect(result.productInfoText).toContain("古い商品");
  });

  it("ignores inactive products", () => {
    upsertProduct(db, {
      asin: "INACTIVE",
      name: "非公開商品",
      affiliate_url: "https://example.com/inactive",
      active: false,
    });

    const result = selectProduct(db);
    expect(result.productId).toBeNull();
  });
});
