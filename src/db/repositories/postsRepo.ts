import type Database from "better-sqlite3";

// postsテーブルへのアクセス層。1レコードが投稿候補1件のライフサイクル全体
// (生成→承認待ち→承認/却下→投稿済み/失敗)を表す。
export type PostStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "posted"
  | "posted_dryrun"
  | "post_failed";

export interface CreatePostInput {
  platform: string;
  product_id: number | null;
  post_type: string | null;
  product_usage: string | null;
  strategy_json: string;
  generated_text: string;
  selfcheck_json: string;
  final_text: string;
  self_check_score: number | null;
  self_check_pass: boolean;
  run_id: string | null;
}

export interface PostRow {
  id: number;
  platform: string;
  product_id: number | null;
  post_type: string | null;
  product_usage: string | null;
  strategy_json: string;
  generated_text: string;
  selfcheck_json: string;
  final_text: string;
  self_check_score: number | null;
  self_check_pass: number | null;
  status: PostStatus;
  github_issue_number: number | null;
  github_issue_url: string | null;
  approved_by: string | null;
  approval_comment_body: string | null;
  tweet_id: string | null;
  tweet_url: string | null;
  post_error: string | null;
  run_id: string | null;
  created_at: string;
  approved_at: string | null;
  posted_at: string | null;
  updated_at: string | null;
}

// パイプライン実行1回につき1行作成する。常にstatus='pending_approval'から開始し、
// その後の承認/投稿処理でstatusを進めていく。
export function createPost(db: Database.Database, input: CreatePostInput): number {
  const result = db
    .prepare(
      `INSERT INTO posts (platform, product_id, post_type, product_usage, strategy_json, generated_text, selfcheck_json, final_text, self_check_score, self_check_pass, status, run_id, updated_at)
       VALUES (@platform, @product_id, @post_type, @product_usage, @strategy_json, @generated_text, @selfcheck_json, @final_text, @self_check_score, @self_check_pass, 'pending_approval', @run_id, CURRENT_TIMESTAMP)`
    )
    .run({
      platform: input.platform,
      product_id: input.product_id,
      post_type: input.post_type,
      product_usage: input.product_usage,
      strategy_json: input.strategy_json,
      generated_text: input.generated_text,
      selfcheck_json: input.selfcheck_json,
      final_text: input.final_text,
      self_check_score: input.self_check_score,
      self_check_pass: input.self_check_pass ? 1 : 0,
      run_id: input.run_id,
    });
  return Number(result.lastInsertRowid);
}

export function setGithubIssue(db: Database.Database, postId: number, issueNumber: number, issueUrl: string): void {
  db.prepare(
    `UPDATE posts SET github_issue_number = ?, github_issue_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(issueNumber, issueUrl, postId);
}

export function getPostById(db: Database.Database, id: number): PostRow | undefined {
  return db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as PostRow | undefined;
}

export function getPostByIssueNumber(db: Database.Database, issueNumber: number): PostRow | undefined {
  return db.prepare(`SELECT * FROM posts WHERE github_issue_number = ?`).get(issueNumber) as PostRow | undefined;
}

// {{recent_posts}}用。却下・投稿失敗した候補は「実際に世に出た投稿」ではないため対象から除外する。
export function listRecentPublishedPosts(db: Database.Database, limit: number): PostRow[] {
  return db
    .prepare(
      `SELECT * FROM posts
       WHERE status IN ('approved', 'posted', 'posted_dryrun')
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as PostRow[];
}

// 商品ローテーション選定用。productsテーブルに「最終使用日時」を持たせず、
// posts側から都度導出することで、却下/失敗した候補がローテーションを歪めないようにしている。
export function getLastUsedAtForProduct(db: Database.Database, productId: number): string | null {
  const row = db
    .prepare(
      `SELECT MAX(created_at) as last_used FROM posts
       WHERE product_id = ? AND status IN ('approved', 'posted', 'posted_dryrun') AND product_usage IN ('natural', 'main')`
    )
    .get(productId) as { last_used: string | null };
  return row.last_used;
}

// 直近window件のpost_type内訳。postConditions側で「商品紹介比率が目標を超えていないか」の
// ヒント生成に使う。
export function countRecentByPostType(db: Database.Database, window: number): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT post_type, COUNT(*) as cnt FROM (
         SELECT post_type FROM posts
         WHERE status IN ('approved', 'posted', 'posted_dryrun')
         ORDER BY created_at DESC
         LIMIT ?
       )
       GROUP BY post_type`
    )
    .all(window) as { post_type: string | null; cnt: number }[];

  const result: Record<string, number> = {};
  for (const row of rows) {
    if (row.post_type) result[row.post_type] = row.cnt;
  }
  return result;
}

export function markApproved(db: Database.Database, id: number, approvedBy: string, commentBody: string): void {
  db.prepare(
    `UPDATE posts SET status = 'approved', approved_by = ?, approval_comment_body = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(approvedBy, commentBody, id);
}

export function markRejected(db: Database.Database, id: number, approvedBy: string, commentBody: string): void {
  db.prepare(
    `UPDATE posts SET status = 'rejected', approved_by = ?, approval_comment_body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(approvedBy, commentBody, id);
}

// 既に却下済みの投稿に対して、後から理由だけを追記/更新する。
// (承認/却下の判定自体はやり直さない。ステータスやIssueのopen/closedには触れない)
export function updateRejectionReason(db: Database.Database, id: number, approvedBy: string, commentBody: string): void {
  db.prepare(
    `UPDATE posts SET approved_by = ?, approval_comment_body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(approvedBy, commentBody, id);
}

// 「却下」というコメントから、キーワードを除いた自由記述部分を却下理由として取り出す。
// 単に「却下」とだけ書かれていた場合(理由なし)はnullを返す。
export function extractRejectionReason(commentBody: string): string | null {
  const stripped = commentBody.replace(/却下/g, "").trim();
  return stripped.length > 0 ? stripped : null;
}

export interface RejectionFeedback {
  createdAt: string;
  postType: string | null;
  theme: string | null;
  reason: string;
}

// フィードバックループ用: 理由が書かれている却下投稿だけを新しい順に返す。
// 次回以降の生成時に「同じ方向性を避ける」ヒントとして{{post_conditions}}に渡す。
export function listRecentRejectionFeedback(db: Database.Database, limit: number): RejectionFeedback[] {
  const rows = db
    .prepare(
      `SELECT created_at, post_type, strategy_json, approval_comment_body FROM posts
       WHERE status = 'rejected' AND approval_comment_body IS NOT NULL
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as {
    created_at: string;
    post_type: string | null;
    strategy_json: string;
    approval_comment_body: string | null;
  }[];

  const feedback: RejectionFeedback[] = [];
  for (const row of rows) {
    if (!row.approval_comment_body) continue;
    const reason = extractRejectionReason(row.approval_comment_body);
    if (!reason) continue;

    let theme: string | null = null;
    try {
      theme = (JSON.parse(row.strategy_json) as { theme?: string }).theme ?? null;
    } catch {
      // strategy_jsonが壊れていてもフィードバック自体は活かす
    }

    feedback.push({ createdAt: row.created_at, postType: row.post_type, theme, reason });
  }
  return feedback;
}

export function markPosted(db: Database.Database, id: number, tweetId: string, tweetUrl: string): void {
  db.prepare(
    `UPDATE posts SET status = 'posted', tweet_id = ?, tweet_url = ?, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(tweetId, tweetUrl, id);
}

export function markPostedDryRun(db: Database.Database, id: number): void {
  db.prepare(
    `UPDATE posts SET status = 'posted_dryrun', posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(id);
}

export function markPostFailed(db: Database.Database, id: number, error: string): void {
  db.prepare(
    `UPDATE posts SET status = 'post_failed', post_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(error, id);
}
