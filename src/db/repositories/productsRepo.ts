import type Database from "better-sqlite3";

// productsテーブルへのアクセス層。data/products.json(手動管理)をDBに反映するためのupsertと、
// パイプラインが使う参照系クエリを提供する。
export interface ProductInput {
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

export interface ProductRow {
  id: number;
  asin: string;
  name: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  affiliate_url: string;
  category: string | null;
  tags: string | null;
  active: number;
  priority: number;
  created_at: string;
  updated_at: string | null;
}

// asinをキーにINSERT ONCE CONFLICT UPDATE。data/products.jsonを編集して再実行するだけで
// 追加・更新の両方を吸収できるようにしている。
export function upsertProduct(db: Database.Database, product: ProductInput): void {
  db.prepare(
    `INSERT INTO products (asin, name, description, price, image_url, affiliate_url, category, tags, active, priority, updated_at)
     VALUES (@asin, @name, @description, @price, @image_url, @affiliate_url, @category, @tags, @active, @priority, CURRENT_TIMESTAMP)
     ON CONFLICT(asin) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       price = excluded.price,
       image_url = excluded.image_url,
       affiliate_url = excluded.affiliate_url,
       category = excluded.category,
       tags = excluded.tags,
       active = excluded.active,
       priority = excluded.priority,
       updated_at = CURRENT_TIMESTAMP`
  ).run({
    asin: product.asin,
    name: product.name,
    description: product.description ?? null,
    price: product.price ?? null,
    image_url: product.image_url ?? null,
    affiliate_url: product.affiliate_url,
    category: product.category ?? null,
    tags: JSON.stringify(product.tags ?? []),
    active: product.active ? 1 : 0,
    priority: product.priority ?? 0,
  });
}

export function listActiveProducts(db: Database.Database): ProductRow[] {
  return db.prepare(`SELECT * FROM products WHERE active = 1`).all() as ProductRow[];
}

export function getProductById(db: Database.Database, id: number): ProductRow | undefined {
  return db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as ProductRow | undefined;
}
