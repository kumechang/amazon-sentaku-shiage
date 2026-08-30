import type Database from "better-sqlite3";
import type { AppConfig } from "../config/types.js";
import { loadAccountInfo } from "../context/accountInfo.js";
import { summarizeRecentPosts } from "../context/recentPostsSummarizer.js";
import { runReplyStage } from "../claude/stages/replyStage.js";
import { getXClient } from "../x/xClient.js";
import { fetchMentions } from "../x/fetchMentions.js";
import {
  createReplyCandidate,
  getByTargetTweetId,
  getLastMentionTargetTweetId,
  countMentionRepliesCreatedOnJstDate,
  setGithubIssue,
  getById,
} from "../db/repositories/replyCandidatesRepo.js";
import { createReplyApprovalIssue } from "../github/createReplyApprovalIssue.js";
import { buildReplyRejectionHint } from "../context/replyRejectionHint.js";
import { finalizeApprovedReply } from "./finalizeApprovedReply.js";
import { isWithinPostingWindow } from "../lib/postingWindow.js";
import { getJstDateString } from "../lib/time.js";
import { hasXCredentials, env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

// 自分が@メンションされた投稿に自動で返信するパイプラインの統括役。
// searchCandidates.ts経由(能動的アプローチ)とは異なり、こちらはX APIの仕様上
// 自動投稿が許可されている経路のため、approvalMode: "auto"なら実際に返信まで行う。
export async function generateMentionReplies(db: Database.Database, config: AppConfig): Promise<number[]> {
  const now = new Date();
  const processedIds: number[] = [];

  if (!isWithinPostingWindow(now, config)) {
    logger.info("outside posting window, skipping mention check");
    return processedIds;
  }

  if (!hasXCredentials()) {
    logger.warn("X API credentials not configured, skipping mention check (dry-run environment)");
    return processedIds;
  }

  const client = getXClient();
  const sinceId = getLastMentionTargetTweetId(db) ?? undefined;
  const mentions = await fetchMentions(client, sinceId);

  // 古い順に処理する(新しい順に返ってくるため反転)。
  const newMentions = mentions.reverse().filter((mention) => !getByTargetTweetId(db, mention.tweetId));
  if (newMentions.length === 0) {
    logger.info("no new mentions found");
    return processedIds;
  }

  const accountInfo = loadAccountInfo();
  const rejectionFeedback = buildReplyRejectionHint(db, config.recentPostsWindow);
  const { maxRepliesPerRun, maxRepliesPerDay } = config.mentionReplySettings;
  const todayJst = getJstDateString(now);

  for (const mention of newMentions) {
    if (processedIds.length >= maxRepliesPerRun) break;

    const repliedToday = countMentionRepliesCreatedOnJstDate(db, todayJst);
    if (repliedToday >= maxRepliesPerDay) {
      logger.info("mention reply daily budget reached, stopping this run", { repliedToday, maxRepliesPerDay });
      break;
    }

    const recentPosts = summarizeRecentPosts(db, config.recentPostsWindow);
    const replyResult = await runReplyStage(config.claudeModel, {
      accountInfo,
      targetAuthor: mention.authorUsername,
      targetText: mention.text,
      recentPosts,
      rejectionFeedback,
    });

    const replyId = createReplyCandidate(db, {
      source: "mention",
      target_tweet_id: mention.tweetId,
      target_author_username: mention.authorUsername,
      target_text: mention.text,
      target_follower_count: mention.followerCount,
      reply_text: replyResult.data.should_reply ? replyResult.data.reply_text : null,
      should_reply: replyResult.data.should_reply,
      skip_reason: replyResult.data.should_reply ? null : replyResult.data.reason,
      run_id: env.githubRunId || null,
    });
    processedIds.push(replyId);

    if (!replyResult.data.should_reply) {
      logger.info("decided not to reply to mention", { replyId, reason: replyResult.data.reason });
      continue;
    }

    // 監査用に承認Issueは常に作成する(autoモードでも同様。generateCandidate.tsと同じ方針)。
    const issue = await createReplyApprovalIssue({
      targetAuthorUsername: mention.authorUsername,
      targetTweetId: mention.tweetId,
      targetText: mention.text,
      replyText: replyResult.data.reply_text,
      reason: replyResult.data.reason,
    });
    if (issue.number > 0) {
      setGithubIssue(db, replyId, issue.number, issue.url);
    }

    logger.info("mention reply candidate created", { replyId, issueNumber: issue.number });

    if (config.approvalMode === "auto") {
      const reply = getById(db, replyId);
      if (reply) {
        await finalizeApprovedReply(db, config, reply);
      }
    }
  }

  return processedIds;
}
