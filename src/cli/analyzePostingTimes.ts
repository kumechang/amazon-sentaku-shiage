// analyze-posting-times.yml から実行されるエントリポイント。
import { getDb } from "../db/client.js";
import { loadConfig } from "../config/loadConfig.js";
import { analyzePostingTimes } from "../pipeline/analyzePostingTimes.js";
import { logger } from "../lib/logger.js";

analyzePostingTimes(getDb(), loadConfig())
  .then(() => logger.info("analyze-posting-times finished"))
  .catch((error) => {
    logger.error("analyze-posting-times failed", { error: String(error) });
    process.exitCode = 1;
  });
