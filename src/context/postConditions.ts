import type Database from "better-sqlite3";
import { countRecentByPostType, listRecentRejectionFeedback } from "../db/repositories/postsRepo.js";
import type { AppConfig } from "../config/types.js";

// 洗濯・仕上げ剤ジャンルは季節性が強い(梅雨の部屋干し、冬の乾燥など)ため、
// 月から大まかな季節ラベルを算出してプロンプトに渡す。
export function getSeasonLabel(month: number): string {
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏(梅雨〜盛夏)";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

// ja-JPロケールでmonth:'numeric'を format() すると"8月"のように単位付き文字列になり
// Number()がNaNになる(getSeasonLabelのどの条件にも一致せず常に"冬"を返してしまう原因になっていた)。
// formatToParts()でmonthパートの値だけを取り出すことで、実際の月を正しく取得する。
export function getJstMonth(date: Date): number {
  const monthPart = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric" })
    .formatToParts(date)
    .find((part) => part.type === "month");
  return Number(monthPart?.value);
}

// {{post_conditions}} を組み立てる。日時・季節・文字数上限に加えて、
// 直近の商品紹介比率が目標を超えている場合はそれを避けるヒントを追記する
// (プロンプトファイル自体は変更せず、コード側の入力で挙動を調整する方針)。
export function buildPostConditions(db: Database.Database, config: AppConfig): string {
  const now = new Date();
  const jstFormatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const jstText = jstFormatter.format(now);
  const jstMonth = getJstMonth(now);

  const lines = [
    `プラットフォーム: ${config.platform}`,
    `投稿予定日時(JST): ${jstText}`,
    `季節: ${getSeasonLabel(jstMonth)}`,
    `文字数上限の目安: 全角換算で${config.xCharLimit}文字相当に収まる長さにしてください。`,
  ];

  const ratioHint = buildProductRatioHint(db, config);
  if (ratioHint) lines.push(ratioHint);

  const problemTypeHint = buildProblemTypeHint(db, config);
  if (problemTypeHint) lines.push(problemTypeHint);

  const rejectionHint = buildRejectionHint(db, config);
  if (rejectionHint) lines.push(rejectionHint);

  return lines.join("\n");
}

// 直近window件に占めるproblemタイプの比率が目標を下回っていたら、優先を促すヒントを返す。
// Tipsスレッド化(generateCandidate.ts)はpost_type="problem"を起点にしているため、
// この比率を上げることでスレッド形式の投稿頻度も上がる。
function buildProblemTypeHint(db: Database.Database, config: AppConfig): string | null {
  const counts = countRecentByPostType(db, config.recentPostsWindow);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  const problemRatio = (counts.problem ?? 0) / total;
  if (problemRatio >= config.targetProblemRatio) return null;

  return (
    "直近の投稿でproblemタイプ(悩み・問題提起・解決策)の比率が目標を下回っています。\n" +
    "今回は可能であればpost_typeを\"problem\"にすることを検討してください。\n" +
    "ただし不自然に無理やり悩みを作らないでください。"
  );
}

// 人がGitHub Issueで却下した際に理由(例:「却下 もう少し日常的な感じがいい」)を書いていれば、
// それを次回生成時のヒントとして渡す。戦略・表現どちらにも関わる内容なので、
// 両ステージが読む{{post_conditions}}経由で伝える。
function buildRejectionHint(db: Database.Database, config: AppConfig): string | null {
  const feedback = listRecentRejectionFeedback(db, config.recentPostsWindow);
  if (feedback.length === 0) return null;

  const lines = feedback.map((f) => {
    const label = [f.postType, f.theme].filter((v): v is string => Boolean(v)).join(" / ");
    return `- ${label ? `[${label}] ` : ""}${f.reason}`;
  });

  return ["直近、以下の理由で却下された投稿があります。同じ方向性を避けてください:", ...lines].join("\n");
}

// 直近window件のうち review/sale タイプが目標比率の1.5倍を超えていたら警告文を返す。
// 閾値の1.5倍は「多少の揺れは許容しつつ明らかな偏りだけ是正する」ための緩めの基準。
function buildProductRatioHint(db: Database.Database, config: AppConfig): string | null {
  const window = config.recentPostsWindow;
  const counts = countRecentByPostType(db, window);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  const reviewRatio = (counts.review ?? 0) / total;
  const saleRatio = (counts.sale ?? 0) / total;

  const warnings: string[] = [];
  if (reviewRatio > config.targetProductRatio.review * 1.5) {
    warnings.push("直近で商品レビュー投稿の比率が目標を超えています。今回は商品紹介を避けるか、レビュー以外のタイプを優先してください。");
  }
  if (saleRatio > config.targetProductRatio.sale * 1.5) {
    warnings.push("直近でセール投稿の比率が目標を超えています。今回はセール訴求を避けてください。");
  }

  return warnings.length > 0 ? warnings.join("\n") : null;
}
