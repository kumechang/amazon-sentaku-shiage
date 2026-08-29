// config/app.json の型定義。
export interface AppConfig {
  approvalMode: "manual" | "auto";
  claudeModel: string;
  selfCheckPassThreshold: number;
  platform: string;
  xCharLimit: number;
  targetProductRatio: {
    review: number;
    sale: number;
  };
  recentPostsWindow: number;
  // アカウントのペルソナ(30代女性の生活者)が投稿していて不自然でない時間帯(JST)。
  // scheduleの発火遅延でこの範囲外にズレ込んだ場合、その回は投稿候補を作らずスキップする。
  postingWindow: {
    startHour: number;
    endHour: number;
  };
}
