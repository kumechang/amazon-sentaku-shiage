import { getOctokit } from "./octokit.js";
import { env, parseGithubRepository } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import type { Strategy } from "../claude/stages/strategyStage.js";
import type { SelfCheckResult } from "../claude/stages/selfCheckStage.js";

// このラベルが付いたIssueだけをhandle-approval.ymlの対象にする
// (無関係なコメントで誤反応しないためのガード)。
export const PENDING_APPROVAL_LABEL = "pending-approval";

export interface ApprovalIssueContent {
  finalText: string;
  // Tipsスレッド(problemタイプの2件目)の場合のみ非null。
  // tipPollOptionsがあれば投票案、tipTextのみあればTipsリプライ案として表示する。
  tipText: string | null;
  tipPollOptions: string[] | null;
  strategy: Strategy;
  selfCheck: SelfCheckResult;
}

export interface CreatedIssue {
  number: number;
  url: string;
}

// Issue本文を組み立てる。承認者が本文だけを見て判断できるよう、投稿候補・スコア・
// 指摘事項・改善点・承認方法をひとまとめにする。
export function buildIssueBody(content: ApprovalIssueContent): string {
  const { finalText, tipText, tipPollOptions, strategy, selfCheck } = content;
  const problems = selfCheck.problems.length > 0 ? selfCheck.problems.map((p) => `- ${p}`).join("\n") : "(なし)";
  const improvements =
    selfCheck.improvements.length > 0 ? selfCheck.improvements.map((i) => `- ${i}`).join("\n") : "(なし)";

  const threadSection = tipPollOptions
    ? [
        "",
        "## 2件目(自分への返信・投票)",
        tipText ?? "",
        ...tipPollOptions.map((option, i) => `${i + 1}. ${option}`),
      ]
    : tipText
      ? ["", "## 2件目(自分への返信・Tipsリプライ案)", "```", tipText, "```"]
      : [];

  const lines = [
    "## 投稿候補(1件目)",
    "```",
    finalText,
    "```",
    ...threadSection,
    "",
    `## スコア: ${selfCheck.score} / 100 (${selfCheck.pass ? "合格" : "不合格 → 自動修正済み"})`,
    "",
    `## 戦略: ${strategy.post_type} / ${strategy.theme}`,
    `理由: ${strategy.reason}`,
    "",
    "## 指摘事項",
    problems,
    "",
    "## 改善点",
    improvements,
    "",
    "---",
    "この投稿を承認する場合はコメントで「承認」、却下する場合は「却下」と入力してください。",
    "却下する場合、「却下 もう少し日常的な感じがいい」のように理由を続けて書くと、次回以降の投稿生成の参考にされます。",
  ];
  if (tipText) lines.push("(承認すると2件目も含めて自動投稿されます)");

  return lines.join("\n");
}

export async function createApprovalIssue(content: ApprovalIssueContent): Promise<CreatedIssue> {
  const repo = parseGithubRepository();
  if (!env.githubToken || !repo) {
    // GITHUB_TOKEN未設定でもパイプライン全体を止めない(ローカル動作確認用)。
    // number: -1 は「Issue未作成」を表すセンチネル値。
    logger.warn("GitHub credentials not configured, skipping issue creation (dry-run)");
    return { number: -1, url: "" };
  }

  const title = `投稿承認: [${content.strategy.post_type}] ${content.strategy.theme}`;
  const body = buildIssueBody(content);

  const { data } = await getOctokit().issues.create({
    owner: repo.owner,
    repo: repo.repo,
    title,
    body,
    labels: [PENDING_APPROVAL_LABEL],
  });

  return { number: data.number, url: data.html_url };
}
