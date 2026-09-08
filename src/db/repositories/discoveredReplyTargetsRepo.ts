import type Database from "better-sqlite3";

// discovered_reply_targetsテーブルへのアクセス層。検索(discoverReplyCandidates)と
// 返信案作成(generateReplyCandidate)を分離するためのプールを扱う。
export type DiscoveredReplySource = "keyword" | "watched_account";

export interface DiscoveredReplyTargetRow {
  id: number;
  source: DiscoveredReplySource;
  matched_keyword: string | null;
  tweet_id: string;
  author_username: string;
  text: string;
  follower_count: number | null;
  discovered_at: string;
}

export interface InsertDiscoveredInput {
  source: DiscoveredReplySource;
  matched_keyword: string | null;
  tweet_id: string;
  author_username: string;
  text: string;
  follower_count: number | null;
}

// プールへ1件追加する。同じツイートが既にある場合は何もしない(tweet_idのUNIQUE制約 +
// INSERT OR IGNORE)。返り値は実際に追加されたかどうか。
export function insertDiscovered(db: Database.Database, input: InsertDiscoveredInput): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO discovered_reply_targets (source, matched_keyword, tweet_id, author_username, text, follower_count)
       VALUES (@source, @matched_keyword, @tweet_id, @author_username, @text, @follower_count)`
    )
    .run(input);
  return result.changes > 0;
}

// 発見順(古い順)に返す。draft側は先に見つかったものから消化する。
export function listBySource(db: Database.Database, source: DiscoveredReplySource): DiscoveredReplyTargetRow[] {
  return db
    .prepare(`SELECT * FROM discovered_reply_targets WHERE source = ? ORDER BY id ASC`)
    .all(source) as DiscoveredReplyTargetRow[];
}

// 返信案作成が消化した(または期限切れで破棄する)候補をプールから取り除く。
export function remove(db: Database.Database, id: number): void {
  db.prepare(`DELETE FROM discovered_reply_targets WHERE id = ?`).run(id);
}

export function countAll(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM discovered_reply_targets`).get() as { count: number };
  return row.count;
}
