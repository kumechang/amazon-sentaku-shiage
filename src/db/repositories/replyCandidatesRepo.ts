import type Database from "better-sqlite3";
import { getJstDateString, parseDbTimestamp } from "../../lib/time.js";
import { extractRejectionReason } from "./postsRepo.js";

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
  matched_keyword: string | null;
  target_tweet_id: string;
  target_author_username: string;
  target_text: string;
  target_follower_count: number | null;
  reply_text: string | null;
  should_reply: boolean;
  skip_reason: string | null;
  run_id: string | null;
  // 返信セルフチェックステージの結果。should_reply=falseの場合はレビュー自体を行わないため
  // 省略可(未指定ならNULLとして保存される)。
  selfcheck_json?: string | null;
  self_check_score?: number | null;
  self_check_pass?: boolean | null;
}

export interface ReplyCandidateRow {
  id: number;
  source: ReplyCandidateSource;
  matched_keyword: string | null;
  target_tweet_id: string;
  target_author_username: string;
  target_text: string;
  target_follower_count: number | null;
  reply_text: string | null;
  should_reply: number;
  skip_reason: string | null;
  selfcheck_json: string | null;
  self_check_score: number | null;
  self_check_pass: number | null;
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
      `INSERT INTO reply_candidates (source, matched_keyword, target_tweet_id, target_author_username, target_text, target_follower_count, reply_text, should_reply, skip_reason, selfcheck_json, self_check_score, self_check_pass, status, run_id, updated_at)
       VALUES (@source, @matched_keyword, @target_tweet_id, @target_author_username, @target_text, @target_follower_count, @reply_text, @should_reply, @skip_reason, @selfcheck_json, @self_check_score, @self_check_pass, @status, @run_id, CURRENT_TIMESTAMP)`
    )
    .run({
      source: input.source,
      matched_keyword: input.matched_keyword,
      target_tweet_id: input.target_tweet_id,
      target_author_username: input.target_author_username,
      target_text: input.target_text,
      target_follower_count: input.target_follower_count,
      reply_text: input.reply_text,
      should_reply: input.should_reply ? 1 : 0,
      skip_reason: input.skip_reason,
      selfcheck_json: input.selfcheck_json ?? null,
      self_check_score: input.self_check_score ?? null,
      self_check_pass: input.self_check_pass === undefined || input.self_check_pass === null ? null : input.self_check_pass ? 1 : 0,
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

export interface ReplyRejectionFeedback {
  createdAt: string;
  targetAuthorUsername: string;
  reason: string;
}

// フィードバックループ用: 理由が書かれている却下返信案だけを新しい順に返す。
// postsRepo.tsのlistRecentRejectionFeedbackの返信版。extractRejectionReasonは
// 「却下」キーワードを含む文字列全般に使える汎用関数のためpostsRepo.tsから再利用する。
export function listRecentReplyRejectionFeedback(db: Database.Database, limit: number): ReplyRejectionFeedback[] {
  const rows = db
    .prepare(
      `SELECT created_at, target_author_username, approval_comment_body FROM reply_candidates
       WHERE status = 'rejected' AND approval_comment_body IS NOT NULL
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as { created_at: string; target_author_username: string; approval_comment_body: string | null }[];

  const feedback: ReplyRejectionFeedback[] = [];
  for (const row of rows) {
    if (!row.approval_comment_body) continue;
    const reason = extractRejectionReason(row.approval_comment_body);
    if (!reason) continue;
    feedback.push({ createdAt: row.created_at, targetAuthorUsername: row.target_author_username, reason });
  }
  return feedback;
}

export interface KeywordOutcomeStats {
  keyword: string;
  goodCount: number;
  badCount: number;
}

// analyze-reply-keywords用: キーワードごとの実績集計。
// 承認/投稿済み=良い実績、却下 or Claude自身がshould_reply=falseと判断(=検索ノイズ)=悪い実績、として扱う。
export function listKeywordOutcomeStats(db: Database.Database): KeywordOutcomeStats[] {
  return db
    .prepare(
      `SELECT matched_keyword as keyword,
         SUM(CASE WHEN status IN ('approved', 'posted', 'posted_dryrun') THEN 1 ELSE 0 END) as goodCount,
         SUM(CASE WHEN status = 'rejected' OR should_reply = 0 THEN 1 ELSE 0 END) as badCount
       FROM reply_candidates
       WHERE source = 'keyword' AND matched_keyword IS NOT NULL
       GROUP BY matched_keyword`
    )
    .all() as KeywordOutcomeStats[];
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
