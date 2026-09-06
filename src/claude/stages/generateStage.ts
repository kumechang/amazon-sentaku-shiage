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
  hashtagPool: string[];
}

// パイプライン第2段階: 第1段階の戦略JSONに従って実際の投稿本文を生成する。
// 出力はプレーンテキストのみ(投稿生成.md の「出力」指示に従う)。
//
// 投稿生成.md には{{post_conditions}}のプレースホルダが無く、文字数上限の指示は
// 戦略決定ステージにしか渡らない設計だった。実際に本文を書くのはこのステージなので、
// {{platform}}の値に文字数上限の注記を付け足すことで、プロンプトファイル自体を
// 変更せずにこのステージにも制約を伝える。
//
// ハッシュタグ未使用でインプレッションがほぼ0件だったため、同じ手法で
// ハッシュタグ付与の指示も追加する(hashtagPoolが空ならこれまで通り何も注入しない)。
export async function runGenerateStage(model: string, input: GenerateStageInput): Promise<string> {
  // 実際の上限ぴったりを目安として伝えると超過しがちなため、8割程度を目標値として
  // 提示しつつ上限も明記し、狙いより短めに収まりやすくする。
  const targetChars = Math.round(input.charLimit * 0.8);

  const hashtagInstruction =
    input.hashtagPool.length > 0
      ? `\n文末に、投稿内容に関連するハッシュタグを1〜2個付けてください(例: ${input.hashtagPool
          .map((keyword) => `#${keyword}`)
          .join(" ")} などから内容に合うものを選ぶか、内容に応じて自然な別のハッシュタグにしても構いません)。ハッシュタグも含めて全角${input.charLimit}文字以内に収めてください。`
      : "";

  const template = loadPromptTemplate("投稿生成.md");
  const prompt = renderPrompt(template, {
    account_info: input.accountInfo,
    product_info: input.productInfo,
    post_strategy: JSON.stringify(input.strategy),
    recent_posts: input.recentPosts,
    platform: `${input.platform}(【重要】投稿本文は全角${targetChars}文字程度を目標にし、絶対に全角${input.charLimit}文字を超えないでください。超えそうな場合は表現を削って短くしてください)${hashtagInstruction}`,
  });
  const text = await callClaude(model, prompt);
  return text.trim();
}
