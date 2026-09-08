import { readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import { loadAccountInfo } from "../context/accountInfo.js";
import { summarizeRecentPosts } from "../context/recentPostsSummarizer.js";
import { runReplyStage } from "../claude/stages/replyStage.js";
import { getXClient } from "../x/xClient.js";
import { searchByKeywords, searchByWatchedAccounts, matchKeyword, type SearchCandidate } from "../x/searchCandidates.js";
import { createReplyCandidate, getByTargetTweetId, setGithubIssue } from "../db/repositories/replyCandidatesRepo.js";
import { getWeight, getAverageWeight } from "../db/repositories/replyKeywordWeightsRepo.js";
import { createReplyApprovalIssue } from "../github/createReplyApprovalIssue.js";
import { buildReplyRejectionHint } from "../context/replyRejectionHint.js";
import { shouldGenerateReplyNow } from "./shouldGenerateReplyNow.js";
import { hasXCredentials, env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

interface WatchedAccountEntry {
  username: string;
  note?: string;
  active: boolean;
}

function loadWatchedUsernames(): string[] {
  const filePath = path.resolve(process.cwd(), "data/watched_accounts.json");
  const entries = JSON.parse(readFileSync(filePath, "utf-8")) as WatchedAccountEntry[];
  return entries.filter((entry) => entry.active).map((entry) => entry.username);
}

function isFreshCandidate(db: Database.Database, candidate: SearchCandidate): boolean {
  if (!candidate.authorUsername) return false;
  if (getByTargetTweetId(db, candidate.tweetId)) return false; // 重複除外
  return true;
}

// 未処理の候補を1件選ぶ。ウォッチ対象アカウントを常に優先する。
//
// ウォッチ対象アカウント(data/watched_accounts.json)は、フォロワー1万人以上の
// 「憧れのアカウント」を人力で選定して登録する運用(README参照)のため、
// replySettings.minFollowers/maxFollowers(キーワード検索のノイズ除去用の目安レンジ)は適用しない。
// これを適用すると、まさに狙いたい大きめのアカウント(maxFollowersを超える)が
// フィルタで弾かれてしまう。
function pickCandidate(
  db: Database.Database,
  watchedCandidates: SearchCandidate[],
  keywordCandidates: SearchCandidate[],
  config: AppConfig
): SearchCandidate | null {
  for (const candidate of watchedCandidates) {
    if (isFreshCandidate(db, candidate)) return candidate;
  }

  const { minFollowers, maxFollowers } = config.replySettings;
  for (const candidate of keywordCandidates) {
    if (!isFreshCandidate(db, candidate)) continue;
    if (candidate.followerCount === null) continue;
    if (candidate.followerCount < minFollowers || candidate.followerCount > maxFollowers) continue;
    return candidate;
  }
  return null;
}

// キーワード検索結果を、そのキーワードの学習済み重み(降順)で並べ替える。
// 未分析のキーワードは全体平均で扱う(posting_time_weightsと同じ考え方)。
function sortKeywordResultsByWeight(
  db: Database.Database,
  candidates: SearchCandidate[],
  keywords: string[]
): SearchCandidate[] {
  const average = getAverageWeight(db);
  const weightOf = (candidate: SearchCandidate): number => {
    const keyword = matchKeyword(candidate.text, keywords);
    return keyword ? getWeight(db, keyword) : average;
  };
  return [...candidates].sort((a, b) => weightOf(b) - weightOf(a));
}

// 他アカウントの投稿への返信候補を1件作るパイプラインの統括役。
// shouldGenerateReplyNow(検索は有料のため、生成すべきタイミングでのみ実行) →
// 検索(キーワード+ウォッチ対象) → 候補選定 → Claudeが返信すべきか判断 → DB保存 →
// (返信すべき場合のみ)承認Issue作成、の順で進む。
export async function generateReplyCandidate(db: Database.Database, config: AppConfig): Promise<number | null> {
  const now = new Date();

  if (!shouldGenerateReplyNow(db, config, now)) {
    logger.info("skipping this reply run (throttled by shouldGenerateReplyNow)");
    return null;
  }

  if (!hasXCredentials()) {
    logger.warn("X API credentials not configured, skipping reply search (dry-run environment)");
    return null;
  }

  const client = getXClient();
  const watchedUsernames = loadWatchedUsernames();

  const [keywordResults, watchedResults] = await Promise.all([
    searchByKeywords(client, config.replySettings.keywords),
    searchByWatchedAccounts(client, watchedUsernames),
  ]);

  // ウォッチ対象アカウントの投稿を優先する(キーワードよりジャンル適合度が高いと見なす)。
  // キーワード由来の候補群は、学習済みの重み(承認されやすいキーワードほど高い)で並べ替える。
  const sortedKeywordResults = sortKeywordResultsByWeight(db, keywordResults, config.replySettings.keywords);
  const candidate = pickCandidate(db, watchedResults, sortedKeywordResults, config);
  if (!candidate) {
    logger.info("no reply candidates found this run");
    return null;
  }

  const accountInfo = loadAccountInfo();
  const recentPosts = summarizeRecentPosts(db, config.recentPostsWindow);
  const rejectionFeedback = buildReplyRejectionHint(db, config.recentPostsWindow);

  const source: "keyword" | "watched_account" = watchedUsernames.includes(candidate.authorUsername)
    ? "watched_account"
    : "keyword";
  const matchedKeyword = source === "keyword" ? matchKeyword(candidate.text, config.replySettings.keywords) : null;

  const replyResult = await runReplyStage(config.claudeModel, {
    accountInfo,
    targetAuthor: candidate.authorUsername,
    targetText: candidate.text,
    recentPosts,
    rejectionFeedback,
  });

  const replyId = createReplyCandidate(db, {
    source,
    matched_keyword: matchedKeyword,
    target_tweet_id: candidate.tweetId,
    target_author_username: candidate.authorUsername,
    target_text: candidate.text,
    target_follower_count: candidate.followerCount,
    reply_text: replyResult.data.should_reply ? replyResult.data.reply_text : null,
    should_reply: replyResult.data.should_reply,
    skip_reason: replyResult.data.should_reply ? null : replyResult.data.reason,
    run_id: env.githubRunId || null,
  });

  if (!replyResult.data.should_reply) {
    logger.info("decided not to reply", { replyId, reason: replyResult.data.reason });
    return replyId;
  }

  const issue = await createReplyApprovalIssue({
    targetAuthorUsername: candidate.authorUsername,
    targetTweetId: candidate.tweetId,
    targetText: candidate.text,
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
