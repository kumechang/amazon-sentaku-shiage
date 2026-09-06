// config/app.json の型定義。
export interface AppConfig {
  // メンション返信(generateMentionReplies.ts)の自動投稿可否。X APIの仕様上ここのみ
  // 自動投稿が許可されているが、実運用でまだ検証していないため現状はmanual運用。
  approvalMode: "manual" | "auto";
  // 通常投稿(generateCandidate.ts)の自動投稿可否。承認フローの信頼性が上がってきたため
  // approvalModeとは別フラグにして、メンション返信とは独立に切り替えられるようにしている。
  postApprovalMode: "manual" | "auto";
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
  // 投稿末尾に付けるハッシュタグの候補プール。空配列なら注入自体を行わない
  // (replySettings.keywordsと同じ「空なら機能オフ」の運用)。
  postHashtags: string[];
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
