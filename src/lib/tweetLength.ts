// twitter-textはCJS(default export内にまとめられた形)で配布されているため、
// ESM上では named import (`import { parseTweet }`) が使えず default 経由で取り出す必要がある。
import twitterText from "twitter-text";
const { parseTweet } = twitterText;

// CJK文字を2文字分として数えるX仕様の加重長を返す。
export function getWeightedLength(text: string): number {
  return parseTweet(text).weightedLength;
}
