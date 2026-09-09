import { z } from "zod";
import { loadPromptTemplate, renderPrompt } from "../promptLoader.js";
import { callClaudeJson } from "../jsonRetry.js";

// 返信セルフチェック.md の出力JSON形式。合否に関わらずfinal_replyには
// (不合格なら1回分修正済みの)最終的なリプライ案が入る想定。
export const replySelfCheckSchema = z.object({
  score: z.number(),
  pass: z.boolean(),
  problems: z.array(z.string()),
  improvements: z.array(z.string()),
  final_reply: z.string(),
});

export type ReplySelfCheckResult = z.infer<typeof replySelfCheckSchema>;

export interface ReplySelfCheckStageInput {
  accountInfo: string;
  targetAuthor: string;
  targetText: string;
  replyText: string;
  passThreshold: number;
}

// 返信生成ステージが作ったリプライ案をレビューし、不合格なら修正版も同時に作らせる
// (セルフチェック.mdと同じ「レビュー+その場で1回だけ書き直し」のパターン。
// レビュー→書き直し→再レビュー、というループはしない)。
export async function runReplySelfCheckStage(
  model: string,
  input: ReplySelfCheckStageInput
): Promise<{ raw: string; data: ReplySelfCheckResult }> {
  const template = loadPromptTemplate("返信セルフチェック.md");
  const prompt = renderPrompt(template, {
    account_info: input.accountInfo,
    target_author: input.targetAuthor,
    target_text: input.targetText,
    reply_text: input.replyText,
    pass_threshold_note: `総合評価が${input.passThreshold}点以上で合格。`,
  });
  return callClaudeJson(model, prompt, replySelfCheckSchema);
}
