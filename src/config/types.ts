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
  // 1日あたりの目標投稿候補数。generate-postsは投稿可能時間帯の間毎時起動するが、
  // 実際に生成するかはshouldGenerateNowがこの目標値をもとに確率的に判断する。
  targetPostsPerDay: number;
  // 直近の投稿候補作成からこの時間(h)未満なら、次の生成をスキップする(連投防止)。
  minSpacingHours: number;
  // 他アカウントの投稿への返信機能の設定(能動的アプローチ。手動投稿の下書き支援のみ)。
  replySettings: {
    targetRepliesPerDay: number;
    minSpacingHours: number;
    minFollowers: number;
    maxFollowers: number;
    keywords: string[];
  };
  // 自分が@メンションされた投稿への返信設定(X APIの仕様上ここのみ自動投稿可能)。
  mentionReplySettings: {
    maxRepliesPerRun: number;
    maxRepliesPerDay: number;
  };
}
