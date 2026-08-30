import { getOctokit } from "./octokit.js";
import { env, parseGithubRepository } from "../lib/env.js";
import { logger } from "../lib/logger.js";

// createApprovalIssue.tsの投稿承認用Issueと混同しないよう別ラベルにする
// (handle-approval.ymlとhandle-reply-approval.ymlの反応先を分けるためのガード)。
export const PENDING_REPLY_APPROVAL_LABEL = "pending-reply-approval";

export interface ReplyApprovalIssueContent {
  targetAuthorUsername: string;
  targetText: string;
  replyText: string;
  reason: string;
}

export interface CreatedIssue {
  number: number;
  url: string;
}

export function buildReplyIssueBody(content: ReplyApprovalIssueContent): string {
  return [
    "## 返信対象",
    `@${content.targetAuthorUsername}: ${content.targetText}`,
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
    "この返信を承認する場合はコメントで「承認」、却下する場合は「却下」と入力してください。",
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
