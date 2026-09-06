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
  charLimit: number;
  passThreshold: number;
}

// パイプライン第3段階: 生成された投稿を10項目で採点し、不合格なら修正版も同時に作らせる。
//
// セルフチェック.md には文字数に関するチェック項目・{{post_conditions}}のプレースホルダが無く、
// 不合格時の修正(final_post)が文字数を意識せず書き直されて、生成ステージ側で収まっていた
// 文字数を再び超過するケースがあった。{{product_info}}の先頭に制約メモを付け足すことで、
// プロンプトファイル自体を変更せずに修正時も文字数を意識させる。
//
// セルフチェック.md本文には合格基準(80点)が直書きされているが、運用しながら
// 調整したい値のため、同じ仕組みで先頭に上書きメモを足しconfig.selfCheckPassThresholdを
// 実際に効かせている(ファイル自体の基準はそのまま残るが、このメモを優先させる)。
export async function runSelfCheckStage(
  model: string,
  input: SelfCheckStageInput
): Promise<{ raw: string; data: SelfCheckResult }> {
  const template = loadPromptTemplate("セルフチェック.md");
  const prompt = renderPrompt(template, {
    generated_post: input.generatedPost,
    post_strategy: JSON.stringify(input.strategy),
    product_info: `【合格基準】文中に「80点以上で合格」とありますが、${input.passThreshold}点以上を合格としてください(この基準を優先してください)。\n【文字数制約】final_postは全角${input.charLimit}文字を絶対に超えないでください。修正する場合も文字数を必ず守ってください。\n【ハッシュタグ】投稿本文の末尾にハッシュタグがある場合は、修正時もそのまま維持してください。\n\n${input.productInfo}`,
  });
  return callClaudeJson(model, prompt, selfCheckSchema);
}
