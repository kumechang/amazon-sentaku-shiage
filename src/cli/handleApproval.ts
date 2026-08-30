import { getDb } from "../db/client.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseApprovalEvent } from "../github/parseApprovalEvent.js";
import { PENDING_APPROVAL_LABEL } from "../github/createApprovalIssue.js";
import {
  getPostByIssueNumber,
  markApproved,
  markRejected,
  updateRejectionReason,
  extractRejectionReason,
  getPostById,
} from "../db/repositories/postsRepo.js";
import { finalizeApprovedPost } from "../pipeline/finalizeApprovedPost.js";
import { closeIssueWithResult, commentOnIssue } from "../github/closeIssueWithResult.js";
import { logger } from "../lib/logger.js";

// handle-approval.yml (issue_commentイベント)から実行されるエントリポイント。
async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is not set");
  }

  const event = parseApprovalEvent(eventPath, PENDING_APPROVAL_LABEL);
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
    // 既に却下済みの投稿に、後から却下理由だけを追記したいケースは許容する
    // (承認/却下の判定自体はやり直さず、次回生成へのフィードバック用データだけ更新する)。
    if (event.decision === "reject" && post.status === "rejected") {
      const reason = extractRejectionReason(event.commentBody);
      updateRejectionReason(db, post.id, event.commenter, event.commentBody);
      await commentOnIssue(
        event.issueNumber,
        reason
          ? "却下理由を記録しました。次回以降の投稿生成の参考にします。"
          : "却下理由が読み取れませんでした。「却下 理由」の形式でコメントしてください。"
      );
      logger.info("rejection reason updated", { postId: post.id, reason });
      return;
    }

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
