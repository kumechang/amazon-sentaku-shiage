// data/products.jsonをDBに反映するだけの単独コマンド(ローカルでの確認用。
// generate.tsの内部でも毎回自動実行される)。
import { getDb } from "../db/client.js";
import { syncProducts } from "../products/syncProducts.js";
import { logger } from "../lib/logger.js";

const count = syncProducts(getDb());
logger.info("sync-products finished", { count });
