import type Database from "better-sqlite3";
import { listActiveProducts, type ProductRow } from "../db/repositories/productsRepo.js";
import { getLastUsedAtForProduct } from "../db/repositories/postsRepo.js";

export interface SelectedProduct {
  productId: number | null;
  productInfoText: string;
}

// 商品を一切登場させない回もある前提で、その場合は「商品なし」を明示的にプロンプトへ伝える。
const NO_PRODUCT_TEXT =
  "今回、投稿の題材として提示できる商品はありません。商品を登場させる必然性がない前提で戦略・投稿を作成してください。";

// 今回の候補として提示する商品を1件選ぶ。
// 「使うかどうか・どう使うか」の判断は投稿戦略決定プロンプト側(Claude)に委ねるため、
// ここでは単に「一度も使われていない商品」を優先し、その次に「最後に使われてから時間が経っている商品」を
// 優先するローテーションのみを行う。
export function selectProduct(db: Database.Database): SelectedProduct {
  const active = listActiveProducts(db);
  if (active.length === 0) {
    return { productId: null, productInfoText: NO_PRODUCT_TEXT };
  }

  const withRecency = active.map((product) => ({
    product,
    lastUsedAt: getLastUsedAtForProduct(db, product.id),
  }));

  withRecency.sort((a, b) => {
    // 未使用(null)を最優先
    if (a.lastUsedAt === null && b.lastUsedAt !== null) return -1;
    if (a.lastUsedAt !== null && b.lastUsedAt === null) return 1;
    // 使用済み同士は最終使用日時が古い方を優先
    if (a.lastUsedAt !== null && b.lastUsedAt !== null && a.lastUsedAt !== b.lastUsedAt) {
      return a.lastUsedAt < b.lastUsedAt ? -1 : 1;
    }
    // 同条件ならpriorityが高い方、それも同じならランダム
    if (a.product.priority !== b.product.priority) {
      return b.product.priority - a.product.priority;
    }
    return Math.random() - 0.5;
  });

  const chosen = withRecency[0]!.product;
  return { productId: chosen.id, productInfoText: formatProductInfo(chosen) };
}

// {{product_info}} に渡すテキストを組み立てる。価格は手動管理で陳腐化しうるため、
// 「断定的に書かない」注記を添えて事実誤認を防ぐ。
function formatProductInfo(product: ProductRow): string {
  const tags = (JSON.parse(product.tags ?? "[]") as string[]).join("、");
  const lines = [
    `商品名: ${product.name}`,
    product.description ? `特徴: ${product.description}` : null,
    product.category ? `カテゴリ: ${product.category}` : null,
    tags ? `タグ: ${tags}` : null,
    product.price !== null ? `参考価格: 約${product.price}円(手動登録のため変動している可能性があります。断定的に価格を書かないでください)` : null,
    `Amazonリンク: ${product.affiliate_url}`,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
