import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import type { ReplyCandidateRow } from "../db/repositories/replyCandidatesRepo.js";
import { markPosted, markPostedDryRun, markPostFailed } from "../db/repositories/replyCandidatesRepo.js";
import { postReply, TweetTooLongError } from "../x/postTweet.js";
import { closeIssueWithResult, commentOnIssue } from "../github/closeIssueWithResult.js";
import { logger } from "../lib/logger.js";

// 承認済み返信の最終処理(X返信投稿→DB更新→Issue通知)。finalizeApprovedPost.tsと同型で、
// 手動承認フロー(handleReplyApproval.ts)・autoモードの即時投稿(generateReplyCandidate.ts)の
// 両方から呼ぶ。
export async function finalizeApprovedReply(
  db: Database.Database,
  config: AppConfig,
  reply: ReplyCandidateRow
): Promise<void> {
  const issueNumber = reply.github_issue_number && reply.github_issue_number > 0 ? reply.github_issue_number : null;

  if (!reply.reply_text) {
    throw new Error(`reply_candidate ${reply.id} has no reply_text`);
  }

  try {
    const result = await postReply(reply.reply_text, reply.target_tweet_id, config.xCharLimit);

    if (result.dryRun) {
      markPostedDryRun(db, reply.id);
      if (issueNumber) {
        await closeIssueWithResult(
          issueNumber,
          "ドライラン: X APIキー未設定のため実際の返信は行っていません(DB上はposted_dryrunとして記録)。"
        );
      }
      logger.info("reply finalized (dry-run)", { replyId: reply.id });
      return;
    }

    markPosted(db, reply.id, result.tweetId, result.tweetUrl);
    if (issueNumber) {
      await closeIssueWithResult(issueNumber, `返信しました: ${result.tweetUrl}`);
    }
    logger.info("reply finalized", { replyId: reply.id, tweetUrl: result.tweetUrl });
  } catch (error) {
    const message =
      error instanceof TweetTooLongError ? `文字数超過のため返信できませんでした: ${error.message}` : String(error);
    markPostFailed(db, reply.id, message);
    if (issueNumber) {
      await commentOnIssue(issueNumber, `返信に失敗しました: ${message}`);
    }
    throw error;
  }
}
