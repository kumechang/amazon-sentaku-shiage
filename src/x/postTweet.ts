// twitter-textはCJS(default export内にまとめられた形)で配布されているため、
// ESM上では named import (`import { parseTweet }`) が使えず default 経由で取り出す必要がある。
import twitterText from "twitter-text";
const { parseTweet } = twitterText;
import { getXClient } from "./xClient.js";
import { hasXCredentials } from "../lib/env.js";
import { logger } from "../lib/logger.js";

export interface PostTweetResult {
  dryRun: boolean;
  tweetId: string;
  tweetUrl: string;
}

export class TweetTooLongError extends Error {}

// 元プロンプトには文字数ルールが無いため、投稿直前にアプリ側で文字数ガードをかける。
// セルフチェック済みの本文をここで黙って切り詰めると意味が変わってしまうため、
// 超過時は投稿せず例外として扱う。
export async function postTweet(text: string, charLimit: number): Promise<PostTweetResult> {
  // CJK文字を2文字分として数えるX仕様の加重長でチェックする。
  const parsed = parseTweet(text);
  if (parsed.weightedLength > charLimit) {
    throw new TweetTooLongError(
      `tweet exceeds char limit: ${parsed.weightedLength} > ${charLimit}`
    );
  }

  if (!hasXCredentials()) {
    // X APIキー未取得の現段階では、ここで処理を止めずログのみでドライラン扱いにする。
    logger.warn("X API credentials not configured, skipping actual post (dry-run)", { text });
    return { dryRun: true, tweetId: "", tweetUrl: "" };
  }

  const result = await getXClient().v2.tweet(text);
  const tweetId = result.data.id;
  return {
    dryRun: false,
    tweetId,
    tweetUrl: `https://x.com/i/web/status/${tweetId}`,
  };
}
