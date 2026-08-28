import type Database from "better-sqlite3";
import { listRecentPublishedPosts } from "../db/repositories/postsRepo.js";
import { getLatestMetricsForPost } from "../db/repositories/metricsRepo.js";

interface StrategyJsonShape {
  post_type?: string;
  theme?: string;
}

// {{recent_posts}} 用のテキストを組み立てる。テーマ・構成の重複を避けるための材料として、
// 直近投稿のタイプ・テーマ・冒頭・(あれば)エンゲージメント数を1行ずつ渡す。
export function summarizeRecentPosts(db: Database.Database, limit: number): string {
  const posts = listRecentPublishedPosts(db, limit);
  if (posts.length === 0) {
    return "直近の投稿はまだありません。";
  }

  const lines = posts.map((post) => {
    let strategy: StrategyJsonShape = {};
    try {
      strategy = JSON.parse(post.strategy_json) as StrategyJsonShape;
    } catch {
      // strategy_jsonが不正でも要約自体は継続する
    }

    const metrics = getLatestMetricsForPost(db, post.id);
    const metricsText = metrics
      ? ` (❤${metrics.likes ?? 0} 🔁${metrics.reposts ?? 0} 💬${metrics.replies ?? 0})`
      : "";

    const theme = strategy.theme ?? "(不明)";
    const postType = strategy.post_type ?? post.post_type ?? "(不明)";

    return `- [${post.created_at}] type=${postType} theme=${theme} 本文冒頭: ${firstLine(post.final_text)}${metricsText}`;
  });

  return lines.join("\n");
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}
