import { readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import { getXClient } from "../x/xClient.js";
import { searchByKeywords, searchByWatchedAccounts, matchKeyword, type SearchCandidate } from "../x/searchCandidates.js";
import { insertDiscovered, type DiscoveredReplySource } from "../db/repositories/discoveredReplyTargetsRepo.js";
import { getByTargetTweetId } from "../db/repositories/replyCandidatesRepo.js";
import { hasXCredentials } from "../lib/env.js";
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

// 検索結果をdiscovered_reply_targetsプールへ貯める。既にreply_candidatesとして
// 処理済みのツイートは、再検索でヒットしてもプールに戻さない(target_tweet_idのUNIQUE制約で
// 後段のcreateReplyCandidateが失敗するのを避けるため)。
function storeResults(db: Database.Database, source: DiscoveredReplySource, candidates: SearchCandidate[], keywords: string[]): number {
  let inserted = 0;
  for (const candidate of candidates) {
    if (!candidate.authorUsername) continue;
    if (getByTargetTweetId(db, candidate.tweetId)) continue;
    const added = insertDiscovered(db, {
      source,
      matched_keyword: source === "keyword" ? matchKeyword(candidate.text, keywords) : null,
      tweet_id: candidate.tweetId,
      author_username: candidate.authorUsername,
      text: candidate.text,
      follower_count: candidate.followerCount,
    });
    if (added) inserted++;
  }
  return inserted;
}

// 他アカウントの投稿への返信候補を検索し、プールに貯めるだけの役割。
// 返信案の作成(Claude呼び出し・GitHub Issue作成)はgenerateReplyCandidateが
// プールから取り出して別途行う(検索API呼び出し回数を抑えるため、検索と下書き作成を分離している)。
export async function discoverReplyCandidates(db: Database.Database, config: AppConfig): Promise<number> {
  if (!hasXCredentials()) {
    logger.warn("X API credentials not configured, skipping reply discovery (dry-run environment)");
    return 0;
  }

  const client = getXClient();
  const watchedUsernames = loadWatchedUsernames();

  const [keywordResults, watchedResults] = await Promise.all([
    searchByKeywords(client, config.replySettings.keywords),
    searchByWatchedAccounts(client, watchedUsernames),
  ]);

  const inserted =
    storeResults(db, "watched_account", watchedResults, config.replySettings.keywords) +
    storeResults(db, "keyword", keywordResults, config.replySettings.keywords);

  logger.info("reply candidate discovery finished", { inserted });
  return inserted;
}
