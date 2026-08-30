import type { TwitterApi } from "twitter-api-v2";
import type { SearchCandidate } from "./searchCandidates.js";

// 自分が@メンションされた投稿を取得する。X APIの仕様上、メンション/引用されていない
// 投稿へのプログラム経由の返信はできないが、自分がメンションされた投稿にはAPI経由で
// 返信できる(searchCandidates.tsの能動的アプローチとは別経路)。
export async function fetchMentions(client: TwitterApi, sinceId?: string): Promise<SearchCandidate[]> {
  const me = await client.v2.me();

  const result = await client.v2.userMentionTimeline(me.data.id, {
    max_results: 20,
    since_id: sinceId,
    expansions: ["author_id"],
    "user.fields": ["public_metrics"],
  });

  return result.tweets
    .filter((tweet) => tweet.author_id !== me.data.id) // 自分自身の投稿(自己メンション)は除外
    .map((tweet) => {
      const author = result.includes.author(tweet);
      return {
        tweetId: tweet.id,
        authorUsername: author?.username ?? "",
        text: tweet.text,
        followerCount: author?.public_metrics?.followers_count ?? null,
      };
    });
}
