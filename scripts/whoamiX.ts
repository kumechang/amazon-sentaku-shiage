// .envに設定中のAccess Token/SecretがどのXアカウントに紐づいているかを確認するだけの
// read-only診断スクリプト(投稿など書き込みは一切行わない)。
import { getXClient } from "../src/x/xClient.js";
import { hasXCredentials } from "../src/lib/env.js";

async function main(): Promise<void> {
  if (!hasXCredentials()) {
    throw new Error(".env に X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET を設定してください");
  }

  const me = await getXClient().v2.me();
  console.log(`このトークンは @${me.data.username} (${me.data.name}) に紐づいています。`);
}

main().catch((error) => {
  console.error("確認に失敗しました:", error);
  process.exitCode = 1;
});
