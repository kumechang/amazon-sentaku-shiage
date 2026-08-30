import type Database from "better-sqlite3";
import { listRecentReplyRejectionFeedback } from "../db/repositories/replyCandidatesRepo.js";

const NO_FEEDBACK_TEXT = "(却下された返信案はまだありません)";

// 返信生成.md の {{rejection_feedback}} 用テキストを組み立てる。
// postConditions.tsのbuildRejectionHint(投稿用)と同じ発想の返信版。
export function buildReplyRejectionHint(db: Database.Database, limit: number): string {
  const feedback = listRecentReplyRejectionFeedback(db, limit);
  if (feedback.length === 0) return NO_FEEDBACK_TEXT;

  return feedback.map((f) => `- [@${f.targetAuthorUsername}宛て] ${f.reason}`).join("\n");
}
