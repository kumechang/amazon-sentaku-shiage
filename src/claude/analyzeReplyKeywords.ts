import { z } from "zod";
import { callClaudeJson } from "./jsonRetry.js";

const weightEntrySchema = z.object({
  keyword: z.string(),
  weight: z.number().min(0.1).max(3),
  reason: z.string(),
});

export const analyzeReplyKeywordsSchema = z.object({
  weights: z.array(weightEntrySchema),
});

export type AnalyzeReplyKeywordsResult = z.infer<typeof analyzeReplyKeywordsSchema>;

// analyzePostingTimes.tsのキーワード版。返信検索キーワードごとの承認/却下実績から、
// 次回以降の候補選定(generateReplyCandidate.tsのsortByWeight)が
// 参照する「キーワードごとの優先度」を算出させる。
export async function analyzeReplyKeywords(model: string, statsText: string): Promise<AnalyzeReplyKeywordsResult> {
  const prompt = [
    "あなたはSNS運用データの分析担当です。",
    "以下は、洗濯・仕上げ剤ジャンルのXアカウントが、他アカウントの投稿への返信候補を探すために",
    "使っている検索キーワードごとの実績です。「良い実績」は人間が承認した(または実際に投稿した)返信案の件数、",
    "「悪い実績」は人間が却下した、またはAIが返信すべきでないと判断した(検索ノイズだった)件数です。",
    "",
    statsText,
    "",
    "# タスク",
    "この実績をもとに、各キーワードの優先度を「重み」として算出してください。",
    "重みが高いキーワードほど、複数の候補が見つかったときに優先的に採用されます。",
    "",
    "# 注意点",
    "- 平均的なキーワードの重みは1.0を基準にしてください。",
    "- 良い実績の割合が高いキーワードほど重みを高く、悪い実績の割合が高いキーワードほど重みを低くしてください。",
    "- 件数が少ないキーワードは、外れ値に引きずられないよう重みを1.0に近づけてください。",
    "- 重みの範囲は0.1〜3.0としてください。",
    "- 実績に含まれるキーワードについてのみ出力してください。",
    "",
    "# 出力",
    "JSONのみを出力してください。",
    "",
    '{ "weights": [ { "keyword": "部屋干し", "weight": 1.0, "reason": "" } ] }',
  ].join("\n");

  const { data } = await callClaudeJson(model, prompt, analyzeReplyKeywordsSchema);
  return data;
}
