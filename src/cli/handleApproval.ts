import { getDb } from "../db/client.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseApprovalEvent } from "../github/parseApprovalEvent.js";
import { getPostByIssueNumber, markApproved, markRejected, getPostById } from "../db/repositories/postsRepo.js";
import { finalizeApprovedPost } from "../pipeline/finalizeApprovedPost.js";
import { closeIssueWithResult, commentOnIssue } from "../github/closeIssueWithResult.js";
import { logger } from "../lib/logger.js";

// handle-approval.yml (issue_commentイベント)から実行されるエントリポイント。
async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is not set");
  }

  const event = parseApprovalEvent(eventPath);
  if (event.decision === "ignore") {
    logger.info("comment ignored (no matching label or keyword)", { issueNumber: event.issueNumber });
    return;
  }

  const db = getDb();
  const config = loadConfig();

  const post = getPostByIssueNumber(db, event.issueNumber);
  if (!post) {
    logger.warn("no post found for issue", { issueNumber: event.issueNumber });
    return;
  }

  // post_failedからの再承認(投稿失敗後のリトライ)は許容するが、
  // 既にapproved/rejected/postedになっている投稿への二重コメントはno-opにする。
  const actionable = post.status === "pending_approval" || post.status === "post_failed";
  if (!actionable) {
    await commentOnIssue(event.issueNumber, `この投稿は既に処理済みです(状態: ${post.status})。`);
    logger.info("post already processed, no-op", { issueNumber: event.issueNumber, status: post.status });
    return;
  }

  if (event.decision === "reject") {
    markRejected(db, post.id, event.commenter, event.commentBody);
    await closeIssueWithResult(event.issueNumber, `@${event.commenter} により却下されました。`);
    logger.info("post rejected", { postId: post.id });
    return;
  }

  markApproved(db, post.id, event.commenter, event.commentBody);
  const approvedPost = getPostById(db, post.id);
  if (!approvedPost) throw new Error("post disappeared after approval update");

  await finalizeApprovedPost(db, config, approvedPost);
  logger.info("post approved and finalized", { postId: post.id });
}

main().catch((error) => {
  logger.error("handle-approval failed", { error: String(error) });
  process.exitCode = 1;
});
