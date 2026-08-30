// handle-reply-approval.yml (issue_commentイベント)から実行されるエントリポイント。
// handleApproval.tsの返信版。
import { getDb } from "../db/client.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseApprovalEvent } from "../github/parseApprovalEvent.js";
import { PENDING_REPLY_APPROVAL_LABEL } from "../github/createReplyApprovalIssue.js";
import { getByIssueNumber, markApproved, markRejected, getById } from "../db/repositories/replyCandidatesRepo.js";
import { finalizeApprovedReply } from "../pipeline/finalizeApprovedReply.js";
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
  const config = loadConfig();

  const reply = getByIssueNumber(db, event.issueNumber);
  if (!reply) {
    logger.warn("no reply candidate found for issue", { issueNumber: event.issueNumber });
    return;
  }

  const actionable = reply.status === "pending_approval" || reply.status === "post_failed";
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
  const approvedReply = getById(db, reply.id);
  if (!approvedReply) throw new Error("reply candidate disappeared after approval update");

  await finalizeApprovedReply(db, config, approvedReply);
  logger.info("reply approved and finalized", { replyId: reply.id });
}

main().catch((error) => {
  logger.error("handle-reply-approval failed", { error: String(error) });
  process.exitCode = 1;
});
