import type { TwitterApi } from "twitter-api-v2";

export interface SearchCandidate {
  tweetId: string;
  authorUsername: string;
  text: string;
  followerCount: number | null;
}

// クエリ文字列の組み立ては実API呼び出しから切り離し、テスト可能な純粋関数にしている。
export function buildKeywordQuery(keywords: string[]): string {
  const orClause = keywords.map((keyword) => `"${keyword}"`).join(" OR ");
  return `(${orClause}) lang:ja -is:retweet -is:reply`;
}

export function buildWatchedAccountQuery(usernames: string[]): string {
  const orClause = usernames.map((username) => `from:${username}`).join(" OR ");
  return `(${orClause}) -is:retweet -is:reply`;
}

async function runSearch(client: TwitterApi, query: string): Promise<SearchCandidate[]> {
  const result = await client.v2.search(query, {
    max_results: 20,
    expansions: ["author_id"],
    "user.fields": ["public_metrics"],
  });

  return result.tweets.map((tweet) => {
    const author = result.includes.author(tweet);
    return {
      tweetId: tweet.id,
      authorUsername: author?.username ?? "",
      text: tweet.text,
      followerCount: author?.public_metrics?.followers_count ?? null,
    };
  });
}

export async function searchByKeywords(client: TwitterApi, keywords: string[]): Promise<SearchCandidate[]> {
  if (keywords.length === 0) return [];
  return runSearch(client, buildKeywordQuery(keywords));
}

export async function searchByWatchedAccounts(client: TwitterApi, usernames: string[]): Promise<SearchCandidate[]> {
  if (usernames.length === 0) return [];
  return runSearch(client, buildWatchedAccountQuery(usernames));
}
