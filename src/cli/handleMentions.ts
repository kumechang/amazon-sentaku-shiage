// handle-mentions.yml から実行されるエントリポイント。
import { getDb } from "../db/client.js";
import { loadConfig } from "../config/loadConfig.js";
import { generateMentionReplies } from "../pipeline/generateMentionReplies.js";
import { logger } from "../lib/logger.js";

async function main(): Promise<void> {
  const db = getDb();
  const config = loadConfig();

  const replyIds = await generateMentionReplies(db, config);
  logger.info("handle-mentions finished", { count: replyIds.length, replyIds });
}

main().catch((error) => {
  logger.error("handle-mentions failed", { error: String(error) });
  process.exitCode = 1;
});
