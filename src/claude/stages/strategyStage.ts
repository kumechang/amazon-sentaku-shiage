import { z } from "zod";
import { loadPromptTemplate, renderPrompt } from "../promptLoader.js";
import { callClaudeJson } from "../jsonRetry.js";

// 投稿戦略決定.md の出力JSON形式(prompt/投稿戦略決定.md の「出力」セクション参照)。
export const strategySchema = z.object({
  post_type: z.enum(["daily", "emotion", "question", "knowledge", "problem", "review", "sale"]),
  theme: z.string(),
  purpose: z.string(),
  hook_direction: z.string(),
  structure: z.array(z.string()),
  product_usage: z.enum(["none", "natural", "main"]),
  amazon_cta: z.enum(["none", "weak", "medium", "strong"]),
  reason: z.string(),
  avoid: z.array(z.string()),
});

export type Strategy = z.infer<typeof strategySchema>;

export interface StrategyStageInput {
  accountInfo: string;
  productInfo: string;
  recentPosts: string;
  postConditions: string;
}

// パイプライン第1段階: 今回どんなテーマ・構成で投稿するかをClaudeに決めさせる。
export async function runStrategyStage(
  model: string,
  input: StrategyStageInput
): Promise<{ raw: string; data: Strategy }> {
  const template = loadPromptTemplate("投稿戦略決定.md");
  const prompt = renderPrompt(template, {
    account_info: input.accountInfo,
    product_info: input.productInfo,
    recent_posts: input.recentPosts,
    post_conditions: input.postConditions,
  });
  return callClaudeJson(model, prompt, strategySchema);
}
