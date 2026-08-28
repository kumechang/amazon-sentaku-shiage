import { loadPromptTemplate, renderPrompt } from "../promptLoader.js";
import { callClaude } from "../client.js";
import type { Strategy } from "./strategyStage.js";

export interface GenerateStageInput {
  accountInfo: string;
  productInfo: string;
  strategy: Strategy;
  recentPosts: string;
  platform: string;
}

// パイプライン第2段階: 第1段階の戦略JSONに従って実際の投稿本文を生成する。
// 出力はプレーンテキストのみ(投稿生成.md の「出力」指示に従う)。
export async function runGenerateStage(model: string, input: GenerateStageInput): Promise<string> {
  const template = loadPromptTemplate("投稿生成.md");
  const prompt = renderPrompt(template, {
    account_info: input.accountInfo,
    product_info: input.productInfo,
    post_strategy: JSON.stringify(input.strategy),
    recent_posts: input.recentPosts,
    platform: input.platform,
  });
  const text = await callClaude(model, prompt);
  return text.trim();
}
