// analyze-reply-keywords.yml から実行されるエントリポイント。
import { getDb } from "../db/client.js";
import { loadConfig } from "../config/loadConfig.js";
import { analyzeReplyKeywords } from "../pipeline/analyzeReplyKeywords.js";
import { logger } from "../lib/logger.js";

analyzeReplyKeywords(getDb(), loadConfig())
  .then(() => logger.info("analyze-reply-keywords finished"))
  .catch((error) => {
    logger.error("analyze-reply-keywords failed", { error: String(error) });
    process.exitCode = 1;
  });
