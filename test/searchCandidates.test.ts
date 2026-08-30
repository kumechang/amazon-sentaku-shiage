import { describe, it, expect } from "vitest";
import { buildKeywordQuery, buildWatchedAccountQuery } from "../src/x/searchCandidates.js";

describe("buildKeywordQuery", () => {
  it("joins keywords with OR and adds language/retweet/reply filters", () => {
    expect(buildKeywordQuery(["部屋干し", "柔軟剤"])).toBe(
      '("部屋干し" OR "柔軟剤") lang:ja -is:retweet -is:reply'
    );
  });

  it("handles a single keyword", () => {
    expect(buildKeywordQuery(["部屋干し"])).toBe('("部屋干し") lang:ja -is:retweet -is:reply');
  });
});

describe("buildWatchedAccountQuery", () => {
  it("joins usernames with from: and OR, excluding retweets/replies", () => {
    expect(buildWatchedAccountQuery(["account_a", "account_b"])).toBe(
      "(from:account_a OR from:account_b) -is:retweet -is:reply"
    );
  });
});
