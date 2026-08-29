import type { AppConfig } from "../config/types.js";
import { getJstHour } from "./time.js";

export { getJstHour } from "./time.js";

// アカウントのペルソナ(30代女性の生活者)が投稿していて不自然でない時間帯かどうか。
// GitHub Actionsのscheduleは数時間単位で遅延することがあり、深夜にズレ込んで実行される
// ことがあるため、そういう回は投稿候補自体を作らずスキップする。
export function isWithinPostingWindow(date: Date, config: AppConfig): boolean {
  const hour = getJstHour(date);
  const { startHour, endHour } = config.postingWindow;
  return hour >= startHour && hour < endHour;
}
