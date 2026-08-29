import { callClaude } from "./client.js";

// 生成→セルフチェックのリトライを重ねても文字数超過が解消しない場合の最終手段。
// マーケティング用プロンプト(投稿生成.md/セルフチェック.md)には手を入れず、
// 意味・トーンを保ったまま短くするだけの単発の指示を別途投げる。
export async function shortenText(model: string, text: string, charLimit: number): Promise<string> {
  const targetChars = Math.round(charLimit * 0.85);
  const prompt = [
    `以下のSNS投稿文を、意味・トーン・改行構成をできるだけ変えずに、全角${targetChars}文字以内に短くしてください。`,
    "文末の問いかけなど、投稿の要点は削らないでください。",
    "",
    "投稿本文のみを出力してください。説明や前置きは不要です。",
    "",
    "---",
    text,
  ].join("\n");

  const result = await callClaude(model, prompt);
  return result.trim();
}
