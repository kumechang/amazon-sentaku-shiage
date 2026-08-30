// generate-replies.yml から実行されるエントリポイント。
import { getDb } from "../db/client.js";
import { loadConfig } from "../config/loadConfig.js";
import { generateReplyCandidate } from "../pipeline/generateReplyCandidate.js";
import { logger } from "../lib/logger.js";

async function main(): Promise<void> {
  const db = getDb();
  const config = loadConfig();

  const replyId = await generateReplyCandidate(db, config);
  logger.info("generate-reply finished", { replyId });
}

main().catch((error) => {
  logger.error("generate-reply failed", { error: String(error) });
  process.exitCode = 1;
});
