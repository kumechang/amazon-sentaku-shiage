import type Database from "better-sqlite3";

// postingTimeWeightsRepo.tsのキーワード版(hourの代わりにkeywordがキー)。

export interface ReplyKeywordWeightEntry {
  keyword: string;
  weight: number;
  reason: string;
}

const DEFAULT_WEIGHT = 1.0;

// 指定キーワードの重み。まだ分析されていないキーワードはデフォルト値(均等)を返す。
export function getWeight(db: Database.Database, keyword: string): number {
  const row = db.prepare(`SELECT weight FROM reply_keyword_weights WHERE keyword = ?`).get(keyword) as
    | { weight: number }
    | undefined;
  return row?.weight ?? DEFAULT_WEIGHT;
}

// 全キーワードの平均重み。1件も分析されていなければデフォルト値。
export function getAverageWeight(db: Database.Database): number {
  const row = db.prepare(`SELECT AVG(weight) as avg FROM reply_keyword_weights`).get() as { avg: number | null };
  return row.avg ?? DEFAULT_WEIGHT;
}

// analyze-reply-keywordsの分析結果をまとめて反映する。
export function upsertWeights(db: Database.Database, entries: ReplyKeywordWeightEntry[]): void {
  const stmt = db.prepare(
    `INSERT INTO reply_keyword_weights (keyword, weight, reason, updated_at)
     VALUES (@keyword, @weight, @reason, CURRENT_TIMESTAMP)
     ON CONFLICT(keyword) DO UPDATE SET
       weight = excluded.weight,
       reason = excluded.reason,
       updated_at = CURRENT_TIMESTAMP`
  );
  const insertAll = db.transaction((rows: ReplyKeywordWeightEntry[]) => {
    for (const row of rows) stmt.run(row);
  });
  insertAll(entries);
}
