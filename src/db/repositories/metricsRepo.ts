import type Database from "better-sqlite3";
import type { PostRow } from "./postsRepo.js";

// post_metricsテーブルへのアクセス層。将来のフィードバックループ用に、投稿ごとの
// エンゲージメントを「最新値で上書き」ではなくスナップショットとして時系列に積んでいく。
export interface MetricsInput {
  post_id: number;
  collected_at: string;
  impressions: number | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  bookmarks: number | null;
}

// エンゲージメント率(いいね+リポスト+返信 / インプレッション)はここで計算して保存する。
export function insertMetrics(db: Database.Database, input: MetricsInput): void {
  const total = (input.likes ?? 0) + (input.reposts ?? 0) + (input.replies ?? 0);
  const engagementRate = input.impressions && input.impressions > 0 ? total / input.impressions : null;

  db.prepare(
    `INSERT INTO post_metrics (post_id, collected_at, impressions, likes, reposts, replies, bookmarks, engagement_rate)
     VALUES (@post_id, @collected_at, @impressions, @likes, @reposts, @replies, @bookmarks, @engagement_rate)`
  ).run({
    post_id: input.post_id,
    collected_at: input.collected_at,
    impressions: input.impressions,
    likes: input.likes,
    reposts: input.reposts,
    replies: input.replies,
    bookmarks: input.bookmarks,
    engagement_rate: engagementRate,
  });
}

export function listPostedWithinDays(db: Database.Database, days: number): PostRow[] {
  return db
    .prepare(
      `SELECT * FROM posts
       WHERE status = 'posted' AND posted_at >= datetime('now', ?)
       ORDER BY posted_at DESC`
    )
    .all(`-${days} days`) as PostRow[];
}

export function getLatestMetricsForPost(
  db: Database.Database,
  postId: number
): { likes: number | null; reposts: number | null; replies: number | null } | undefined {
  return db
    .prepare(
      `SELECT likes, reposts, replies FROM post_metrics WHERE post_id = ? ORDER BY collected_at DESC LIMIT 1`
    )
    .get(postId) as { likes: number | null; reposts: number | null; replies: number | null } | undefined;
}
