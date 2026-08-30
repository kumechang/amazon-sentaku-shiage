import { getOctokit } from "./octokit.js";
import { env, parseGithubRepository } from "../lib/env.js";
import { logger } from "../lib/logger.js";

// createApprovalIssue.tsの投稿承認用Issueと混同しないよう別ラベルにする
// (handle-approval.ymlとhandle-reply-approval.ymlの反応先を分けるためのガード)。
export const PENDING_REPLY_APPROVAL_LABEL = "pending-reply-approval";

export interface ReplyApprovalIssueContent {
  targetAuthorUsername: string;
  targetTweetId: string;
  targetText: string;
  replyText: string;
  reason: string;
}

export interface CreatedIssue {
  number: number;
  url: string;
}

// 2026年2月のX API仕様変更で、メンション/引用されていない投稿へのプログラム経由の返信が
// ブロックされたため、「承認」しても自動投稿はしない(手動投稿の下書き支援に留める)。
// この返信案をコピーし、対象投稿へ手動でXアプリから返信する運用。
export function buildReplyIssueBody(content: ReplyApprovalIssueContent): string {
  const targetUrl = `https://x.com/${content.targetAuthorUsername}/status/${content.targetTweetId}`;
  return [
    "## 返信対象",
    `@${content.targetAuthorUsername}: ${content.targetText}`,
    `${targetUrl}`,
    "",
    "## 返信案",
    "```",
    content.replyText,
    "```",
    "",
    "## 判断理由",
    content.reason,
    "",
    "---",
    "この返信案で良ければコメントで「承認」、不要なら「却下」と入力してください。",
    "承認しても自動投稿はされません(X APIの仕様上、メンション/引用されていない投稿への",
    "自動返信はできないため)。上のリンクから対象投稿を開き、返信案を手動でコピー&投稿してください。",
  ].join("\n");
}

export async function createReplyApprovalIssue(content: ReplyApprovalIssueContent): Promise<CreatedIssue> {
  const repo = parseGithubRepository();
  if (!env.githubToken || !repo) {
    logger.warn("GitHub credentials not configured, skipping reply issue creation (dry-run)");
    return { number: -1, url: "" };
  }

  const title = `返信承認: @${content.targetAuthorUsername}宛て`;
  const body = buildReplyIssueBody(content);

  const { data } = await getOctokit().issues.create({
    owner: repo.owner,
    repo: repo.repo,
    title,
    body,
    labels: [PENDING_REPLY_APPROVAL_LABEL],
  });

  return { number: data.number, url: data.html_url };
}
