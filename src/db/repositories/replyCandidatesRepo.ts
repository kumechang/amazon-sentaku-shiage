import type Database from "better-sqlite3";
import { getJstDateString, parseDbTimestamp } from "../../lib/time.js";

// reply_candidatesテーブルへのアクセス層。postsRepo.tsと対になる構成だが、
// 「自分の投稿」ではなく「他アカウントの投稿への返信候補」を扱うため独立させている。
export type ReplyCandidateStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "posted"
  | "posted_dryrun"
  | "post_failed"
  | "skipped";

// keyword/watched_account: 能動的アプローチ(検索して見つけた投稿への返信、手動投稿の下書き支援のみ)。
// mention: 自分が@メンションされた投稿への返信(X APIの仕様上ここのみ自動投稿が可能)。
export type ReplyCandidateSource = "keyword" | "watched_account" | "mention";

export interface CreateReplyCandidateInput {
  source: ReplyCandidateSource;
  target_tweet_id: string;
  target_author_username: string;
  target_text: string;
  target_follower_count: number | null;
  reply_text: string | null;
  should_reply: boolean;
  skip_reason: string | null;
  run_id: string | null;
}

export interface ReplyCandidateRow {
  id: number;
  source: ReplyCandidateSource;
  target_tweet_id: string;
  target_author_username: string;
  target_text: string;
  target_follower_count: number | null;
  reply_text: string | null;
  should_reply: number;
  skip_reason: string | null;
  status: ReplyCandidateStatus;
  github_issue_number: number | null;
  github_issue_url: string | null;
  approved_by: string | null;
  approval_comment_body: string | null;
  reply_tweet_id: string | null;
  reply_tweet_url: string | null;
  post_error: string | null;
  run_id: string | null;
  created_at: string;
  approved_at: string | null;
  posted_at: string | null;
  updated_at: string | null;
}

// 検索で見つけたツイート1件につき1行作成する。should_reply=falseの場合はstatus='skipped'
// から開始し(承認Issueを作らない)、trueの場合のみ'pending_approval'から開始する。
export function createReplyCandidate(db: Database.Database, input: CreateReplyCandidateInput): number {
  const status: ReplyCandidateStatus = input.should_reply ? "pending_approval" : "skipped";
  const result = db
    .prepare(
      `INSERT INTO reply_candidates (source, target_tweet_id, target_author_username, target_text, target_follower_count, reply_text, should_reply, skip_reason, status, run_id, updated_at)
       VALUES (@source, @target_tweet_id, @target_author_username, @target_text, @target_follower_count, @reply_text, @should_reply, @skip_reason, @status, @run_id, CURRENT_TIMESTAMP)`
    )
    .run({
      source: input.source,
      target_tweet_id: input.target_tweet_id,
      target_author_username: input.target_author_username,
      target_text: input.target_text,
      target_follower_count: input.target_follower_count,
      reply_text: input.reply_text,
      should_reply: input.should_reply ? 1 : 0,
      skip_reason: input.skip_reason,
      status,
      run_id: input.run_id,
    });
  return Number(result.lastInsertRowid);
}

// 検索結果の重複除外用。同じツイートに二重に候補を作らない(target_tweet_idのUNIQUE制約と対応)。
export function getByTargetTweetId(db: Database.Database, targetTweetId: string): ReplyCandidateRow | undefined {
  return db.prepare(`SELECT * FROM reply_candidates WHERE target_tweet_id = ?`).get(targetTweetId) as
    | ReplyCandidateRow
    | undefined;
}

export function setGithubIssue(db: Database.Database, id: number, issueNumber: number, issueUrl: string): void {
  db.prepare(
    `UPDATE reply_candidates SET github_issue_number = ?, github_issue_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(issueNumber, issueUrl, id);
}

export function getById(db: Database.Database, id: number): ReplyCandidateRow | undefined {
  return db.prepare(`SELECT * FROM reply_candidates WHERE id = ?`).get(id) as ReplyCandidateRow | undefined;
}

export function getByIssueNumber(db: Database.Database, issueNumber: number): ReplyCandidateRow | undefined {
  return db.prepare(`SELECT * FROM reply_candidates WHERE github_issue_number = ?`).get(issueNumber) as
    | ReplyCandidateRow
    | undefined;
}

// shouldGenerateReplyNow用: 指定したJSTカレンダー日に作成された返信候補数
// (should_reply=trueのものだけ。skippedは「返信しないと判断した」だけで実際の返信試行ではないため除く)。
export function countRepliesCreatedOnJstDate(db: Database.Database, jstDateString: string): number {
  const rows = db
    .prepare(
      `SELECT created_at FROM reply_candidates
       WHERE should_reply = 1 AND created_at >= datetime(?, '-1 day') AND created_at <= datetime(?, '+1 day')`
    )
    .all(jstDateString, jstDateString) as { created_at: string }[];
  return rows.filter((row) => getJstDateString(parseDbTimestamp(row.created_at)) === jstDateString).length;
}

// shouldGenerateReplyNow用: 直近の返信候補作成日時(should_reply=trueのみ)。minSpacingHoursの間隔判定に使う。
export function getLastReplyCreatedAt(db: Database.Database): string | null {
  const row = db
    .prepare(`SELECT MAX(created_at) as last_created FROM reply_candidates WHERE should_reply = 1`)
    .get() as { last_created: string | null };
  return row.last_created;
}

// generateMentionReplies用: 直近取得したメンションのtweet_id(since_id指定に使い、
// 毎回全件取得し直すのを避ける)。
export function getLastMentionTargetTweetId(db: Database.Database): string | null {
  const row = db
    .prepare(
      `SELECT target_tweet_id FROM reply_candidates WHERE source = 'mention' ORDER BY id DESC LIMIT 1`
    )
    .get() as { target_tweet_id: string } | undefined;
  return row?.target_tweet_id ?? null;
}

// generateMentionReplies用: 指定したJSTカレンダー日にメンション経由で作成された返信候補数
// (should_reply=trueのみ)。keyword/watched_account用の予算とは別プールで管理する。
export function countMentionRepliesCreatedOnJstDate(db: Database.Database, jstDateString: string): number {
  const rows = db
    .prepare(
      `SELECT created_at FROM reply_candidates
       WHERE source = 'mention' AND should_reply = 1
         AND created_at >= datetime(?, '-1 day') AND created_at <= datetime(?, '+1 day')`
    )
    .all(jstDateString, jstDateString) as { created_at: string }[];
  return rows.filter((row) => getJstDateString(parseDbTimestamp(row.created_at)) === jstDateString).length;
}

export function markApproved(db: Database.Database, id: number, approvedBy: string, commentBody: string): void {
  db.prepare(
    `UPDATE reply_candidates SET status = 'approved', approved_by = ?, approval_comment_body = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(approvedBy, commentBody, id);
}

export function markRejected(db: Database.Database, id: number, approvedBy: string, commentBody: string): void {
  db.prepare(
    `UPDATE reply_candidates SET status = 'rejected', approved_by = ?, approval_comment_body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(approvedBy, commentBody, id);
}

export function markPosted(db: Database.Database, id: number, replyTweetId: string, replyTweetUrl: string): void {
  db.prepare(
    `UPDATE reply_candidates SET status = 'posted', reply_tweet_id = ?, reply_tweet_url = ?, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(replyTweetId, replyTweetUrl, id);
}

export function markPostedDryRun(db: Database.Database, id: number): void {
  db.prepare(
    `UPDATE reply_candidates SET status = 'posted_dryrun', posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(id);
}

export function markPostFailed(db: Database.Database, id: number, error: string): void {
  db.prepare(
    `UPDATE reply_candidates SET status = 'post_failed', post_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(error, id);
}
