import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import { listLatestEngagementSamples } from "../db/repositories/metricsRepo.js";
import { upsertWeights } from "../db/repositories/postingTimeWeightsRepo.js";
import { analyzePostingTimes as callAnalyzePostingTimes } from "../claude/analyzePostingTimes.js";
import { getJstHour, parseDbTimestamp } from "../lib/time.js";
import { logger } from "../lib/logger.js";

// データが薄いうちに分析すると、たまたま良かった/悪かった1〜2件で重みが極端に振れてしまう。
// ある程度の母数が貯まるまでは分析自体をスキップし、既定値(均等)のまま運用する。
const MIN_SAMPLES = 10;

// 週次で post_metrics を時間帯別に集計し、Claudeに分析させてposting_time_weightsを更新する。
export async function analyzePostingTimes(db: Database.Database, config: AppConfig): Promise<void> {
  const samples = listLatestEngagementSamples(db);
  if (samples.length < MIN_SAMPLES) {
    logger.info("not enough posted+metriced posts yet, skipping posting-time analysis", {
      count: samples.length,
      required: MIN_SAMPLES,
    });
    return;
  }

  const byHour = new Map<number, { total: number; count: number }>();
  for (const sample of samples) {
    const hour = getJstHour(parseDbTimestamp(sample.postedAt));
    const bucket = byHour.get(hour) ?? { total: 0, count: 0 };
    bucket.total += sample.engagementRate;
    bucket.count += 1;
    byHour.set(hour, bucket);
  }

  const statsLines = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([hour, { total, count }]) =>
        `${hour}時台: 投稿${count}件, 平均エンゲージメント率${((total / count) * 100).toFixed(2)}%`
    );

  const result = await callAnalyzePostingTimes(config.claudeModel, statsLines.join("\n"));
  upsertWeights(db, result.weights);
  logger.info("posting-time weights updated", { hours: result.weights.length });
}
