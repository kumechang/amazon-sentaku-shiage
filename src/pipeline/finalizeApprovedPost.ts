import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import type { PostRow } from "../db/repositories/postsRepo.js";
import { markPosted, markPostedDryRun, markPostFailed, markTipPosted, markTipPostFailed } from "../db/repositories/postsRepo.js";
import { postTweet, postReply, postPollReply, TweetTooLongError, type PostTweetResult } from "../x/postTweet.js";
import { closeIssueWithResult, commentOnIssue } from "../github/closeIssueWithResult.js";
import { logger } from "../lib/logger.js";
import { describeXApiError } from "../lib/xErrorMessage.js";

// Tipsスレッドの2件目(自分自身への返信)を投稿する。reply_kindで通常のtip返信か
// 投票(poll)かを分岐する。
function postThreadReply(post: PostRow, mainTweetId: string, config: AppConfig): Promise<PostTweetResult> {
  if (post.reply_kind === "poll") {
    const options = JSON.parse(post.tip_poll_options ?? "[]") as string[];
    return postPollReply(post.tip_text ?? "", mainTweetId, options, config.pollDurationMinutes, config.xCharLimit);
  }
  return postReply(post.tip_text ?? "", mainTweetId, config.xCharLimit);
}

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
    logger.info("post finalized", { postId: post.id, tweetUrl: result.tweetUrl });

    if (!post.reply_kind) {
      if (issueNumber) {
        await closeIssueWithResult(issueNumber, `投稿しました: ${result.tweetUrl}`);
      }
      return;
    }

    // Tipsスレッドの2件目(自分自身への返信)。メインは既に投稿済みのため、
    // ここで失敗してもメイン投稿自体は失敗扱いにしない(post_errorに記録するのみ)。
    try {
      const tipResult = await postThreadReply(post, result.tweetId, config);
      markTipPosted(db, post.id, tipResult.tweetId, tipResult.tweetUrl);
      if (issueNumber) {
        await closeIssueWithResult(issueNumber, `投稿しました:\nメイン: ${result.tweetUrl}\n2件目: ${tipResult.tweetUrl}`);
      }
      logger.info("thread reply finalized", { postId: post.id, tipTweetUrl: tipResult.tweetUrl });
    } catch (tipError) {
      const tipMessage =
        tipError instanceof TweetTooLongError
          ? `文字数超過のため2件目を投稿できませんでした: ${tipError.message}`
          : describeXApiError(tipError);
      markTipPostFailed(db, post.id, tipMessage);
      if (issueNumber) {
        await commentOnIssue(
          issueNumber,
          `メインは投稿しました(${result.tweetUrl})が、2件目の投稿に失敗しました: ${tipMessage}。手動で投稿してください。`
        );
      }
      logger.error("thread reply failed", { postId: post.id, error: tipMessage });
    }
  } catch (error) {
    const message =
      error instanceof TweetTooLongError
        ? `文字数超過のため投稿できませんでした: ${error.message}`
        : describeXApiError(error);
    markPostFailed(db, post.id, message);
    if (issueNumber) {
      await commentOnIssue(issueNumber, `投稿に失敗しました: ${message}`);
    }
    throw error;
  }
}
