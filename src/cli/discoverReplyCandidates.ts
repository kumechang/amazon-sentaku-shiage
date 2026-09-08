// discover-replies.yml から実行されるエントリポイント。
import { getDb } from "../db/client.js";
import { loadConfig } from "../config/loadConfig.js";
import { discoverReplyCandidates } from "../pipeline/discoverReplyCandidates.js";
import { logger } from "../lib/logger.js";

async function main(): Promise<void> {
  const db = getDb();
  const config = loadConfig();

  const inserted = await discoverReplyCandidates(db, config);
  logger.info("discover-replies finished", { inserted });
}

main().catch((error) => {
  logger.error("discover-replies failed", { error: String(error) });
  process.exitCode = 1;
});
