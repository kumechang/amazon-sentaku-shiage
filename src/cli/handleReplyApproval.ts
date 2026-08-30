// handle-reply-approval.yml (issue_commentイベント)から実行されるエントリポイント。
// handleApproval.tsの返信版だが、2026年2月のX API仕様変更でメンション/引用されていない
// 投稿への自動返信ができなくなったため、「承認」しても自動投稿はしない
// (下書きとして確定させ、手動投稿を促すだけ)。
import { getDb } from "../db/client.js";
import { parseApprovalEvent } from "../github/parseApprovalEvent.js";
import { PENDING_REPLY_APPROVAL_LABEL } from "../github/createReplyApprovalIssue.js";
import { getByIssueNumber, markApproved, markRejected } from "../db/repositories/replyCandidatesRepo.js";
import { closeIssueWithResult, commentOnIssue } from "../github/closeIssueWithResult.js";
import { logger } from "../lib/logger.js";

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is not set");
  }

  const event = parseApprovalEvent(eventPath, PENDING_REPLY_APPROVAL_LABEL);
  if (event.decision === "ignore") {
    logger.info("comment ignored (no matching label or keyword)", { issueNumber: event.issueNumber });
    return;
  }

  const db = getDb();

  const reply = getByIssueNumber(db, event.issueNumber);
  if (!reply) {
    logger.warn("no reply candidate found for issue", { issueNumber: event.issueNumber });
    return;
  }

  const actionable = reply.status === "pending_approval";
  if (!actionable) {
    await commentOnIssue(event.issueNumber, `この返信は既に処理済みです(状態: ${reply.status})。`);
    logger.info("reply already processed, no-op", { issueNumber: event.issueNumber, status: reply.status });
    return;
  }

  if (event.decision === "reject") {
    markRejected(db, reply.id, event.commenter, event.commentBody);
    await closeIssueWithResult(event.issueNumber, `@${event.commenter} により却下されました。`);
    logger.info("reply rejected", { replyId: reply.id });
    return;
  }

  markApproved(db, reply.id, event.commenter, event.commentBody);
  await closeIssueWithResult(
    event.issueNumber,
    `@${event.commenter} により承認されました。上のリンクから対象投稿を開き、返信案を手動でコピー&投稿してください(自動投稿は行われません)。`
  );
  logger.info("reply approved (manual posting required)", { replyId: reply.id });
}

main().catch((error) => {
  logger.error("handle-reply-approval failed", { error: String(error) });
  process.exitCode = 1;
});
