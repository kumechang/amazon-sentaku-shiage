import { callClaude } from "./client.js";
import { getWeightedLength } from "../lib/tweetLength.js";

// 生成→セルフチェックのリトライを重ねても文字数超過が解消しない場合の最終手段。
// マーケティング用プロンプト(投稿生成.md/セルフチェック.md)には手を入れず、
// 意味・トーンを保ったまま短くするだけの単発の指示を別途投げる。
// 現在の文字数を明示することで、どの程度削ればよいかをモデルに掴ませ、
// 複数回呼んでも収束しやすくする。
export async function shortenText(model: string, text: string, charLimit: number): Promise<string> {
  const currentLength = getWeightedLength(text);
  const targetChars = Math.round(charLimit * 0.8);
  const prompt = [
    `以下のSNS投稿文は現在${currentLength}文字相当あり、上限の${charLimit}文字を超えています。`,
    `全角${targetChars}文字程度になるまで、思い切って文章量そのものを削ってください(語尾を整えるだけでは不十分です)。`,
    "意味・トーンは保ちつつ、文末の問いかけなど投稿の要点は残してください。",
    "",
    "投稿本文のみを出力してください。説明や前置きは不要です。",
    "",
    "---",
    text,
  ].join("\n");

  const result = await callClaude(model, prompt);
  return result.trim();
}
