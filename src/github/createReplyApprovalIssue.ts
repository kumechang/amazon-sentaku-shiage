import { getOctokit } from "./octokit.js";
import { env, parseGithubRepository } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import type { ReplySelfCheckResult } from "../claude/stages/replySelfCheckStage.js";

// createApprovalIssue.tsの投稿承認用Issueと混同しないよう別ラベルにする
// (handle-approval.ymlとhandle-reply-approval.ymlの反応先を分けるためのガード)。
export const PENDING_REPLY_APPROVAL_LABEL = "pending-reply-approval";

export interface ReplyApprovalIssueContent {
  targetAuthorUsername: string;
  targetTweetId: string;
  targetText: string;
  // レビュー(返信セルフチェック)後の最終案。selfCheckが不合格だった場合は、レビュー時に
  // その場で1回だけ書き直された版が入る。
  replyText: string;
  reason: string;
  // 返信セルフチェックの結果。レビューを行わなかった場合(呼び出し側の都合等)はnull。
  selfCheck: ReplySelfCheckResult | null;
}

export interface CreatedIssue {
  number: number;
  url: string;
}

// 投稿本文を1行・短く整形する。改行・連続空白を1つのスペースにまとめる。
function truncateForTitle(text: string, maxLength: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength)}…`;
}

// 通知(プッシュ通知やメールの件名)がタイトルしか表示しない場合でも、@ユーザー名だけでなく
// 投稿内容の見当がつくようにする(本文には全文を載せているが、以前はタイトルに載っていなかった)。
export function buildReplyIssueTitle(content: ReplyApprovalIssueContent): string {
  return `返信承認: @${content.targetAuthorUsername} 「${truncateForTitle(content.targetText, 30)}」`;
}

// 2026年2月のX API仕様変更で、メンション/引用されていない投稿へのプログラム経由の返信が
// ブロックされたため、「承認」しても自動投稿はしない(手動投稿の下書き支援に留める)。
// この返信案をコピーし、対象投稿へ手動でXアプリから返信する運用。
export function buildReplyIssueBody(content: ReplyApprovalIssueContent): string {
  const targetUrl = `https://x.com/${content.targetAuthorUsername}/status/${content.targetTweetId}`;
  const { selfCheck } = content;
  const selfCheckSection = selfCheck
    ? [
        "",
        `## セルフチェック: ${selfCheck.score}点 (${selfCheck.pass ? "合格" : "不合格 → 自動修正済み"})`,
        "指摘事項",
        selfCheck.problems.length > 0 ? selfCheck.problems.map((p) => `- ${p}`).join("\n") : "(なし)",
        "改善点",
        selfCheck.improvements.length > 0 ? selfCheck.improvements.map((i) => `- ${i}`).join("\n") : "(なし)",
      ]
    : [];

  return [
    "## 返信対象",
    `@${content.targetAuthorUsername}: ${content.targetText}`,
    `${targetUrl}`,
    "",
    "## 返信案",
    "```",
    content.replyText,
    "```",
    ...selfCheckSection,
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

  const title = buildReplyIssueTitle(content);
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
