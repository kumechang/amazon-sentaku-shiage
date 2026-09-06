import { z } from "zod";
import { callClaudeJson } from "./jsonRetry.js";

// X APIの投票は2〜4択、各選択肢は全角25文字程度までを目安にする。
const pollReplySchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(4),
});

export type PollReplyResult = z.infer<typeof pollReplySchema>;

// マーケティング用の3プロンプトとは別の、Tipsスレッド専用の単発Claude呼び出し。
// 投稿生成.mdはプレーンテキスト出力用で、投票の構造化出力(質問文+選択肢)には向かないため、
// shortenText.ts/analyzePostingTimes.tsと同じ「実装側の単発呼び出し」として新規に用意する。
// フック投稿(「みんなはどうしてる?」的な締め)を受けて、続く投票の質問文と選択肢を作る。
// セルフチェックは行わない(短い質問文のため対象外)。
export async function generatePollReply(model: string, accountInfo: string, hookText: string): Promise<PollReplyResult> {
  const prompt = [
    "あなたは、洗濯・仕上げ剤・香り・暮らしをテーマにしたSNSアカウントの中の人です。",
    "",
    "# アカウント情報",
    "",
    accountInfo,
    "",
    "# 直前に投稿したフック(悩み提起)投稿",
    "",
    hookText,
    "",
    "# タスク",
    "上のフック投稿への自分自身の返信として、フォロワーに投票してもらう質問と選択肢を作ってください。",
    "",
    "# ルール",
    "- 質問文は短く、フック投稿の悩みに自然につながる内容にしてください。",
    "- 選択肢は2〜4個、それぞれ全角12〜25文字程度の短い言葉にしてください。",
    "- 商品名・Amazonリンクなど宣伝的な内容は一切含めないでください。あくまでフォロワーとの会話・エンゲージメントが目的です。",
    "- 架空の個人体験を作らないでください。",
    "",
    "# 出力",
    "JSONのみを出力してください。",
    "",
    '{ "question": "", "options": ["", ""] }',
  ].join("\n");

  const { data } = await callClaudeJson(model, prompt, pollReplySchema);
  return data;
}
