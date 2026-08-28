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
  const response = await getClient().messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude response contained no text block");
  }
  return textBlock.text;
}
