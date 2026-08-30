import { describe, it, expect } from "vitest";
import { buildKeywordQuery, buildWatchedAccountQuery, matchKeyword } from "../src/x/searchCandidates.js";

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

describe("matchKeyword", () => {
  it("returns the first keyword found in the text", () => {
    expect(matchKeyword("今日は部屋干しで生乾き臭がひどい", ["柔軟剤", "部屋干し", "生乾き臭"])).toBe("部屋干し");
  });

  it("returns null when no keyword matches", () => {
    expect(matchKeyword("今日は晴れ", ["柔軟剤", "部屋干し"])).toBeNull();
  });
});
