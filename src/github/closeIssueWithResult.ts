import { getOctokit } from "./octokit.js";
import { env, parseGithubRepository } from "../lib/env.js";
import { logger } from "../lib/logger.js";

// 処理結果をコメントしてIssueをクローズする。投稿完了・却下・自動投稿完了など
// 「これ以上アクションが不要になった」タイミングで呼ぶ。
export async function closeIssueWithResult(issueNumber: number, resultComment: string): Promise<void> {
  const repo = parseGithubRepository();
  if (!env.githubToken || !repo) {
    logger.warn("GitHub credentials not configured, skipping issue close (dry-run)", { issueNumber });
    return;
  }

  await getOctokit().issues.createComment({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: issueNumber,
    body: resultComment,
  });

  await getOctokit().issues.update({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: issueNumber,
    state: "closed",
  });
}

// Issueをクローズせずコメントだけ残す。投稿失敗時など「人の対応が必要かもしれない」場合に使う。
export async function commentOnIssue(issueNumber: number, comment: string): Promise<void> {
  const repo = parseGithubRepository();
  if (!env.githubToken || !repo) {
    logger.warn("GitHub credentials not configured, skipping comment (dry-run)", { issueNumber });
    return;
  }

  await getOctokit().issues.createComment({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: issueNumber,
    body: comment,
  });
}
