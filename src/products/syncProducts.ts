import { readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { upsertProduct, type ProductInput } from "../db/repositories/productsRepo.js";
import { logger } from "../lib/logger.js";

// 人が手動編集する data/products.json を都度読み込み、DBへ反映する。
// PA-APIは使わず、商品情報の唯一の正とするのはこのJSONファイル。
const PRODUCTS_PATH = path.resolve(process.cwd(), "data/products.json");

interface ProductJsonEntry {
  asin: string;
  name: string;
  description?: string | null;
  price?: number | null;
  image_url?: string | null;
  affiliate_url: string;
  category?: string | null;
  tags?: string[];
  active: boolean;
  priority?: number;
}

export function syncProducts(db: Database.Database): number {
  const raw = readFileSync(PRODUCTS_PATH, "utf-8");
  const entries = JSON.parse(raw) as ProductJsonEntry[];

  for (const entry of entries) {
    const input: ProductInput = {
      asin: entry.asin,
      name: entry.name,
      description: entry.description ?? null,
      price: entry.price ?? null,
      image_url: entry.image_url ?? null,
      affiliate_url: entry.affiliate_url,
      category: entry.category ?? null,
      tags: entry.tags ?? [],
      active: entry.active,
      priority: entry.priority ?? 0,
    };
    upsertProduct(db, input);
  }

  logger.info("synced products", { count: entries.length });
  return entries.length;
}
