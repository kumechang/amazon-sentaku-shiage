import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import { loadAccountInfo } from "../context/accountInfo.js";
import { summarizeRecentPosts } from "../context/recentPostsSummarizer.js";
import { runReplyStage } from "../claude/stages/replyStage.js";
import { createReplyCandidate, setGithubIssue } from "../db/repositories/replyCandidatesRepo.js";
import { getWeight, getAverageWeight } from "../db/repositories/replyKeywordWeightsRepo.js";
import {
  listBySource,
  remove as removeDiscovered,
  type DiscoveredReplyTargetRow,
} from "../db/repositories/discoveredReplyTargetsRepo.js";
import { createReplyApprovalIssue } from "../github/createReplyApprovalIssue.js";
import { buildReplyRejectionHint } from "../context/replyRejectionHint.js";
import { shouldGenerateReplyNow } from "./shouldGenerateReplyNow.js";
import { env } from "../lib/env.js";
import { parseDbTimestamp } from "../lib/time.js";
import { logger } from "../lib/logger.js";

function isExpired(row: DiscoveredReplyTargetRow, now: Date, expiryHours: number): boolean {
  const hoursSinceDiscovered = (now.getTime() - parseDbTimestamp(row.discovered_at).getTime()) / (1000 * 60 * 60);
  return hoursSinceDiscovered > expiryHours;
}

// キーワード由来の候補群を、そのキーワードの学習済み重み(降順)で並べ替える。
// 未分析のキーワードは全体平均で扱う(posting_time_weightsと同じ考え方)。
function sortByWeight(db: Database.Database, rows: DiscoveredReplyTargetRow[]): DiscoveredReplyTargetRow[] {
  const average = getAverageWeight(db);
  const weightOf = (row: DiscoveredReplyTargetRow): number => (row.matched_keyword ? getWeight(db, row.matched_keyword) : average);
  return [...rows].sort((a, b) => weightOf(b) - weightOf(a));
}

// discovered_reply_targetsプールから未処理の候補を1件選ぶ。ウォッチ対象アカウントを常に優先する。
// 期限切れ(candidateExpiryHours超過)の候補は、返信案を作らずプールから破棄する
// (古い投稿に今更リプライするのを避けるため)。
//
// ウォッチ対象アカウント(data/watched_accounts.json)は、フォロワー1万人以上の
// 「憧れのアカウント」を人力で選定して登録する運用(README参照)のため、
// replySettings.minFollowers/maxFollowers(キーワード検索のノイズ除去用の目安レンジ)は適用しない。
// これを適用すると、まさに狙いたい大きめのアカウント(maxFollowersを超える)が
// フィルタで弾かれてしまう。
function pickFromPool(db: Database.Database, config: AppConfig, now: Date): DiscoveredReplyTargetRow | null {
  const { minFollowers, maxFollowers, candidateExpiryHours } = config.replySettings;

  for (const row of listBySource(db, "watched_account")) {
    if (isExpired(row, now, candidateExpiryHours)) {
      removeDiscovered(db, row.id);
      continue;
    }
    return row;
  }

  for (const row of sortByWeight(db, listBySource(db, "keyword"))) {
    if (isExpired(row, now, candidateExpiryHours)) {
      removeDiscovered(db, row.id);
      continue;
    }
    if (row.follower_count === null) continue;
    if (row.follower_count < minFollowers || row.follower_count > maxFollowers) continue;
    return row;
  }

  return null;
}

// 他アカウントの投稿への返信候補を1件作るパイプラインの統括役。
// shouldGenerateReplyNow(生成すべきタイミングでのみ実行) →
// discovered_reply_targetsプールから候補選定(検索はここでは行わない。discoverReplyCandidates
// 参照) → Claudeが返信すべきか判断 → DB保存 → (返信すべき場合のみ)承認Issue作成、の順で進む。
export async function generateReplyCandidate(db: Database.Database, config: AppConfig): Promise<number | null> {
  const now = new Date();

  if (!shouldGenerateReplyNow(db, config, now)) {
    logger.info("skipping this reply run (throttled by shouldGenerateReplyNow)");
    return null;
  }

  const picked = pickFromPool(db, config, now);
  if (!picked) {
    logger.info("no reply candidates in discovery pool");
    return null;
  }

  const accountInfo = loadAccountInfo();
  const recentPosts = summarizeRecentPosts(db, config.recentPostsWindow);
  const rejectionFeedback = buildReplyRejectionHint(db, config.recentPostsWindow);

  const replyResult = await runReplyStage(config.claudeModel, {
    accountInfo,
    targetAuthor: picked.author_username,
    targetText: picked.text,
    recentPosts,
    rejectionFeedback,
  });

  const replyId = createReplyCandidate(db, {
    source: picked.source,
    matched_keyword: picked.matched_keyword,
    target_tweet_id: picked.tweet_id,
    target_author_username: picked.author_username,
    target_text: picked.text,
    target_follower_count: picked.follower_count,
    reply_text: replyResult.data.should_reply ? replyResult.data.reply_text : null,
    should_reply: replyResult.data.should_reply,
    skip_reason: replyResult.data.should_reply ? null : replyResult.data.reason,
    run_id: env.githubRunId || null,
  });

  // 結果によらずプールから消化する(同じツイートを再度候補にしないため)。
  removeDiscovered(db, picked.id);

  if (!replyResult.data.should_reply) {
    logger.info("decided not to reply", { replyId, reason: replyResult.data.reason });
    return replyId;
  }

  const issue = await createReplyApprovalIssue({
    targetAuthorUsername: picked.author_username,
    targetTweetId: picked.tweet_id,
    targetText: picked.text,
    replyText: replyResult.data.reply_text,
    reason: replyResult.data.reason,
  });
  if (issue.number > 0) {
    setGithubIssue(db, replyId, issue.number, issue.url);
  }

  logger.info("reply candidate created", { replyId, issueNumber: issue.number });

  // 2026年2月のX API仕様変更で、メンション/引用されていない投稿への自動返信はできなくなった
  // ため、approvalModeが"auto"でもここでは投稿しない(手動投稿の下書き支援に留める)。
  return replyId;
}
