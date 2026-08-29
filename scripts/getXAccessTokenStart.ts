// PIN-based OAuth (3-legged OAuth) の前半。
// 認可用URLを発行し、次のステップ(getXAccessTokenFinish.ts)で使うリクエストトークンを
// 一時ファイルに保存する。
import { writeFileSync } from "node:fs";
import path from "node:path";
import { TwitterApi } from "twitter-api-v2";
import { env } from "../src/lib/env.js";

const TEMP_PATH = path.resolve(process.cwd(), ".x-oauth-temp.json");

async function main(): Promise<void> {
  if (!env.x.apiKey || !env.x.apiSecret) {
    throw new Error(".env の X_API_KEY / X_API_SECRET を先に設定してください");
  }

  const appClient = new TwitterApi({ appKey: env.x.apiKey, appSecret: env.x.apiSecret });
  // linkMode: 'authorize' は毎回ログイン/アカウント選択画面を出すため、
  // 別アカウント(ボット用)に切り替えて認可したい今回の用途に適している。
  const authLink = await appClient.generateAuthLink(undefined, { linkMode: "authorize" });

  writeFileSync(
    TEMP_PATH,
    JSON.stringify({ oauth_token: authLink.oauth_token, oauth_token_secret: authLink.oauth_token_secret })
  );

  console.log("\n投稿させたいXアカウントでログインした状態のブラウザで、以下のURLを開いてください:");
  console.log(`\n${authLink.url}\n`);
  console.log("「アプリを認可する」を押すと画面にPINコードが表示されます。");
  console.log("そのPINコードを使って `npm run get-x-token:finish -- <PIN>` を実行してください。\n");
}

main().catch((error) => {
  console.error("失敗しました:", error);
  process.exitCode = 1;
});
