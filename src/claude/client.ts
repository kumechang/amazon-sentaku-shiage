import Anthropic from "@anthropic-ai/sdk";
import { env } from "../lib/env.js";

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (client) return client;
  client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

// 1回のメッセージ呼び出しの薄いラッパー。モデルIDは呼び出し側(config/app.json)から渡すため、
// モデルの切り替えはここを変更せず設定ファイルの書き換えだけで完結する。
export async function callClaude(model: string, prompt: string): Promise<string> {
  // thinkingを明示的に無効化しないと、拡張思考にmax_tokensの予算を使い切られて
  // 肝心の本文が一切出力されないまま打ち切られることがあった
  // (投稿文の作成・チェックというタスクには深い推論は不要なため無効化して問題ない)。
  const response = await getClient().messages.create({
    model,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Claude response contained no text block (stop_reason=${response.stop_reason}, content_types=${response.content.map((b) => b.type).join(",")})`
    );
  }
  return textBlock.text;
}
