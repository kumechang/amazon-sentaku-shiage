import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import { listKeywordOutcomeStats } from "../db/repositories/replyCandidatesRepo.js";
import { upsertWeights } from "../db/repositories/replyKeywordWeightsRepo.js";
import { analyzeReplyKeywords as callAnalyzeReplyKeywords } from "../claude/analyzeReplyKeywords.js";
import { logger } from "../lib/logger.js";

// データが薄いうちに分析すると、たまたま良かった/悪かった1〜2件で重みが極端に振れてしまう。
// analyzePostingTimes.tsと同じ考え方でMIN_SAMPLESを設ける。
const MIN_SAMPLES = 10;

// 週次で reply_candidates をキーワード別に集計し、Claudeに分析させてreply_keyword_weightsを更新する。
export async function analyzeReplyKeywords(db: Database.Database, config: AppConfig): Promise<void> {
  const stats = listKeywordOutcomeStats(db);
  const totalSamples = stats.reduce((sum, s) => sum + s.goodCount + s.badCount, 0);
  if (totalSamples < MIN_SAMPLES) {
    logger.info("not enough keyword-attributed reply candidates yet, skipping keyword analysis", {
      count: totalSamples,
      required: MIN_SAMPLES,
    });
    return;
  }

  const statsLines = stats
    .sort((a, b) => b.goodCount + b.badCount - (a.goodCount + a.badCount))
    .map((s) => `${s.keyword}: 良い実績${s.goodCount}件, 悪い実績${s.badCount}件`);

  const result = await callAnalyzeReplyKeywords(config.claudeModel, statsLines.join("\n"));
  upsertWeights(db, result.weights);
  logger.info("reply keyword weights updated", { keywords: result.weights.length });
}
