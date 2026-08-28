import type Database from "better-sqlite3";
import { getXClient } from "../x/xClient.js";
import { hasXCredentials } from "../lib/env.js";
import { listPostedWithinDays } from "../db/repositories/metricsRepo.js";
import { insertMetrics } from "../db/repositories/metricsRepo.js";
import { logger } from "../lib/logger.js";

// フィードバックループv1: 直近days日分の投稿済みツイートのエンゲージメントを取得し、
// post_metricsにスナップショットとして記録する。ここで貯めた数値は
// recentPostsSummarizer が {{recent_posts}} に織り込み、Claudeの戦略判断に活用させる想定。
export async function collectMetrics(db: Database.Database, days: number): Promise<number> {
  if (!hasXCredentials()) {
    logger.warn("X API credentials not configured, skipping metrics collection");
    return 0;
  }

  const posts = listPostedWithinDays(db, days).filter((post) => post.tweet_id);
  if (posts.length === 0) {
    logger.info("no posted tweets to collect metrics for");
    return 0;
  }

  const ids = posts.map((post) => post.tweet_id as string);
  const response = await getXClient().v2.tweets(ids, { "tweet.fields": ["public_metrics"] });

  const collectedAt = new Date().toISOString();
  let count = 0;
  for (const post of posts) {
    const tweet = response.data.find((t) => t.id === post.tweet_id);
    const metrics = tweet?.public_metrics;
    if (!metrics) continue;

    insertMetrics(db, {
      post_id: post.id,
      collected_at: collectedAt,
      impressions: metrics.impression_count ?? null,
      likes: metrics.like_count ?? null,
      reposts: metrics.retweet_count ?? null,
      replies: metrics.reply_count ?? null,
      bookmarks: metrics.bookmark_count ?? null,
    });
    count += 1;
  }

  logger.info("collected metrics", { count });
  return count;
}
