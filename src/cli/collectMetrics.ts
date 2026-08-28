// collect-metrics.yml から実行されるエントリポイント。
import { getDb } from "../db/client.js";
import { collectMetrics } from "../metrics/collectMetrics.js";
import { logger } from "../lib/logger.js";

const METRICS_WINDOW_DAYS = 14;

collectMetrics(getDb(), METRICS_WINDOW_DAYS)
  .then((count) => logger.info("collect-metrics finished", { count }))
  .catch((error) => {
    logger.error("collect-metrics failed", { error: String(error) });
    process.exitCode = 1;
  });
