import { readFileSync } from "node:fs";

export type ApprovalDecision = "approve" | "reject" | "ignore";

export interface ApprovalEvent {
  decision: ApprovalDecision;
  issueNumber: number;
  commenter: string;
  commentBody: string;
}

interface IssueCommentEventPayload {
  action: string;
  comment: { body: string; user: { login: string } };
  issue: { number: number; labels: { name: string }[] };
}

// issue_commentイベントのペイロード(GITHUB_EVENT_PATHのJSON)から、
// 「承認」/「却下」/無視すべきコメントかを判定する。
// requiredLabelが付いていないIssueへのコメントは無関係な議論とみなし無視する
// (投稿承認用のpending-approvalと、返信承認用のpending-reply-approvalの両方で使い回す)。
export function parseApprovalEvent(eventPath: string, requiredLabel: string): ApprovalEvent {
  const raw = readFileSync(eventPath, "utf-8");
  const payload = JSON.parse(raw) as IssueCommentEventPayload;

  const issueNumber = payload.issue.number;
  const commentBody = payload.comment.body;
  const commenter = payload.comment.user.login;

  const hasPendingLabel = payload.issue.labels.some((label) => label.name === requiredLabel);
  if (!hasPendingLabel) {
    return { decision: "ignore", issueNumber, commenter, commentBody };
  }

  if (commentBody.includes("承認")) {
    return { decision: "approve", issueNumber, commenter, commentBody };
  }
  if (commentBody.includes("却下")) {
    return { decision: "reject", issueNumber, commenter, commentBody };
  }
  return { decision: "ignore", issueNumber, commenter, commentBody };
}
