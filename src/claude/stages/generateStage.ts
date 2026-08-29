import { loadPromptTemplate, renderPrompt } from "../promptLoader.js";
import { callClaude } from "../client.js";
import type { Strategy } from "./strategyStage.js";

export interface GenerateStageInput {
  accountInfo: string;
  productInfo: string;
  strategy: Strategy;
  recentPosts: string;
  platform: string;
  charLimit: number;
}

// パイプライン第2段階: 第1段階の戦略JSONに従って実際の投稿本文を生成する。
// 出力はプレーンテキストのみ(投稿生成.md の「出力」指示に従う)。
//
// 投稿生成.md には{{post_conditions}}のプレースホルダが無く、文字数上限の指示は
// 戦略決定ステージにしか渡らない設計だった。実際に本文を書くのはこのステージなので、
// {{platform}}の値に文字数上限の注記を付け足すことで、プロンプトファイル自体を
// 変更せずにこのステージにも制約を伝える。
export async function runGenerateStage(model: string, input: GenerateStageInput): Promise<string> {
  const template = loadPromptTemplate("投稿生成.md");
  const prompt = renderPrompt(template, {
    account_info: input.accountInfo,
    product_info: input.productInfo,
    post_strategy: JSON.stringify(input.strategy),
    recent_posts: input.recentPosts,
    platform: `${input.platform}(投稿本文は全角換算で${input.charLimit}文字以内に収めてください)`,
  });
  const text = await callClaude(model, prompt);
  return text.trim();
}
