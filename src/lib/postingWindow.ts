import type { AppConfig } from "../config/types.js";

// en-USロケール + hour12:false で取得する。日本語ロケールでは単位付き文字列になる
// (postConditions.tsの季節バグと同種の問題)ことがあるため避ける。
// また、深夜0時をhour12:falseで取得すると"24"を返す実装があるため0に正規化する。
export function getJstHour(date: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false })
    .formatToParts(date)
    .find((p) => p.type === "hour");
  const hour = Number(part?.value);
  return hour === 24 ? 0 : hour;
}

// アカウントのペルソナ(30代女性の生活者)が投稿していて不自然でない時間帯かどうか。
// GitHub Actionsのscheduleは数時間単位で遅延することがあり、深夜にズレ込んで実行される
// ことがあるため、そういう回は投稿候補自体を作らずスキップする。
export function isWithinPostingWindow(date: Date, config: AppConfig): boolean {
  const hour = getJstHour(date);
  const { startHour, endHour } = config.postingWindow;
  return hour >= startHour && hour < endHour;
}
