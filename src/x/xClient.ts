import { TwitterApi } from "twitter-api-v2";
import { env } from "../lib/env.js";

let client: TwitterApi | undefined;

// OAuth 1.0aのユーザーコンテキスト認証(投稿・自分のツイートのメトリクス取得に必要)。
export function getXClient(): TwitterApi {
  if (client) return client;
  client = new TwitterApi({
    appKey: env.x.apiKey,
    appSecret: env.x.apiSecret,
    accessToken: env.x.accessToken,
    accessSecret: env.x.accessSecret,
  });
  return client;
}
