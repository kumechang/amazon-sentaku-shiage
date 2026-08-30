import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import { countRepliesCreatedOnJstDate, getLastReplyCreatedAt } from "../db/repositories/replyCandidatesRepo.js";
import { computePostingProbability, countRemainingActiveHours } from "./shouldGenerateNow.js";
import { getJstDateString, parseDbTimestamp } from "../lib/time.js";

// 今回、返信先を検索しにいくべきかどうかを判定する。検索API自体が有料のため、
// generateCandidate用のshouldGenerateNowと同じ確率的スロットリングを、
// replySettings(targetRepliesPerDay/minSpacingHours)を使って先に行い、
// trueの場合のみ呼び出し側が検索を実行する。時間帯の重み付けはposts用と共有しない
// (返信は投稿とは性質が異なるため、まずは均等な確率で開始する)。
export function shouldGenerateReplyNow(db: Database.Database, config: AppConfig, now: Date): boolean {
  const { targetRepliesPerDay, minSpacingHours } = config.replySettings;

  const lastCreatedAt = getLastReplyCreatedAt(db);
  if (lastCreatedAt) {
    const hoursSinceLast = (now.getTime() - parseDbTimestamp(lastCreatedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast < minSpacingHours) return false;
  }

  const createdToday = countRepliesCreatedOnJstDate(db, getJstDateString(now));
  const remainingTarget = targetRepliesPerDay - createdToday;
  const remainingActiveHours = countRemainingActiveHours(now, config);

  const probability = computePostingProbability({
    remainingTarget,
    remainingActiveHours,
    hourWeight: 1,
    averageWeight: 1,
  });

  return Math.random() < probability;
}
