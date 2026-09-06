import { getXClient } from "./xClient.js";
import { hasXCredentials } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { getWeightedLength } from "../lib/tweetLength.js";

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
  const weightedLength = getWeightedLength(text);
  if (weightedLength > charLimit) {
    throw new TweetTooLongError(`tweet exceeds char limit: ${weightedLength} > ${charLimit}`);
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

// 他アカウントの投稿への返信版。文字数ガード・ドライラン挙動はpostTweetと同じ。
export async function postReply(text: string, inReplyToTweetId: string, charLimit: number): Promise<PostTweetResult> {
  const weightedLength = getWeightedLength(text);
  if (weightedLength > charLimit) {
    throw new TweetTooLongError(`reply exceeds char limit: ${weightedLength} > ${charLimit}`);
  }

  if (!hasXCredentials()) {
    logger.warn("X API credentials not configured, skipping actual reply (dry-run)", { text, inReplyToTweetId });
    return { dryRun: true, tweetId: "", tweetUrl: "" };
  }

  const result = await getXClient().v2.reply(text, inReplyToTweetId);
  const tweetId = result.data.id;
  return {
    dryRun: false,
    tweetId,
    tweetUrl: `https://x.com/i/web/status/${tweetId}`,
  };
}

// Tipsスレッドの投票版返信。自分自身の投稿への返信のため、通常のpostReplyと同じくX APIの
// 反スパム制限の対象外(投稿者本人)。twitter-api-v2のreply()はpayload引数をそのまま
// リクエストボディへマージするため、poll指定もこの形で渡せる。
export async function postPollReply(
  text: string,
  inReplyToTweetId: string,
  options: string[],
  durationMinutes: number,
  charLimit: number
): Promise<PostTweetResult> {
  const weightedLength = getWeightedLength(text);
  if (weightedLength > charLimit) {
    throw new TweetTooLongError(`poll reply exceeds char limit: ${weightedLength} > ${charLimit}`);
  }

  if (!hasXCredentials()) {
    logger.warn("X API credentials not configured, skipping actual poll reply (dry-run)", { text, inReplyToTweetId });
    return { dryRun: true, tweetId: "", tweetUrl: "" };
  }

  const result = await getXClient().v2.reply(text, inReplyToTweetId, {
    poll: { options, duration_minutes: durationMinutes },
  });
  const tweetId = result.data.id;
  return {
    dryRun: false,
    tweetId,
    tweetUrl: `https://x.com/i/web/status/${tweetId}`,
  };
}
