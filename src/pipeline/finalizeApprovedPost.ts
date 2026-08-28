import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import type { PostRow } from "../db/repositories/postsRepo.js";
import { markPosted, markPostedDryRun, markPostFailed } from "../db/repositories/postsRepo.js";
import { postTweet, TweetTooLongError } from "../x/postTweet.js";
import { closeIssueWithResult, commentOnIssue } from "../github/closeIssueWithResult.js";
import { logger } from "../lib/logger.js";

// 承認済み投稿の最終処理(X投稿→DB更新→Issue通知)をまとめた共通関数。
// 手動承認フロー(handleApproval.ts)からも、autoモードの即時投稿(generateCandidate.ts)からも
// 同じ関数を呼ぶことで、承認方法が違っても投稿後の扱いが一貫するようにしている。
export async function finalizeApprovedPost(db: Database.Database, config: AppConfig, post: PostRow): Promise<void> {
  // github_issue_numberが未設定(-1センチネル含む)ならGitHub側の通知処理は全てスキップする。
  const issueNumber = post.github_issue_number && post.github_issue_number > 0 ? post.github_issue_number : null;

  try {
    const result = await postTweet(post.final_text, config.xCharLimit);

    if (result.dryRun) {
      markPostedDryRun(db, post.id);
      if (issueNumber) {
        await closeIssueWithResult(
          issueNumber,
          "ドライラン: X APIキー未設定のため実際の投稿は行っていません(DB上はposted_dryrunとして記録)。"
        );
      }
      logger.info("post finalized (dry-run)", { postId: post.id });
      return;
    }

    markPosted(db, post.id, result.tweetId, result.tweetUrl);
    if (issueNumber) {
      await closeIssueWithResult(issueNumber, `投稿しました: ${result.tweetUrl}`);
    }
    logger.info("post finalized", { postId: post.id, tweetUrl: result.tweetUrl });
  } catch (error) {
    const message =
      error instanceof TweetTooLongError ? `文字数超過のため投稿できませんでした: ${error.message}` : String(error);
    markPostFailed(db, post.id, message);
    if (issueNumber) {
      await commentOnIssue(issueNumber, `投稿に失敗しました: ${message}`);
    }
    throw error;
  }
}
