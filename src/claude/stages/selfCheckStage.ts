import { z } from "zod";
import { loadPromptTemplate, renderPrompt } from "../promptLoader.js";
import { callClaudeJson } from "../jsonRetry.js";
import type { Strategy } from "./strategyStage.js";

// セルフチェック.md の出力JSON形式。合否に関わらずfinal_postには
// (不合格なら1回分修正済みの)最終候補本文が入る想定。
export const selfCheckSchema = z.object({
  score: z.number(),
  pass: z.boolean(),
  problems: z.array(z.string()),
  improvements: z.array(z.string()),
  final_post: z.string(),
});

export type SelfCheckResult = z.infer<typeof selfCheckSchema>;

export interface SelfCheckStageInput {
  generatedPost: string;
  strategy: Strategy;
  productInfo: string;
}

// パイプライン第3段階: 生成された投稿を10項目で採点し、80点未満なら修正版も同時に作らせる。
export async function runSelfCheckStage(
  model: string,
  input: SelfCheckStageInput
): Promise<{ raw: string; data: SelfCheckResult }> {
  const template = loadPromptTemplate("セルフチェック.md");
  const prompt = renderPrompt(template, {
    generated_post: input.generatedPost,
    post_strategy: JSON.stringify(input.strategy),
    product_info: input.productInfo,
  });
  return callClaudeJson(model, prompt, selfCheckSchema);
}
