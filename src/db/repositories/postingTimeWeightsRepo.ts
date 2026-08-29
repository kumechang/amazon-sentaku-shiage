import type Database from "better-sqlite3";

export interface PostingTimeWeightEntry {
  hour: number; // 0-23 (JST)
  weight: number;
  reason: string;
}

const DEFAULT_WEIGHT = 1.0;

// 指定時間帯の重み。まだ分析されていない時間帯はデフォルト値(均等)を返す。
export function getWeight(db: Database.Database, hour: number): number {
  const row = db.prepare(`SELECT weight FROM posting_time_weights WHERE hour = ?`).get(hour) as
    | { weight: number }
    | undefined;
  return row?.weight ?? DEFAULT_WEIGHT;
}

// 全24時間の平均重み。1件も分析されていなければデフォルト値。
export function getAverageWeight(db: Database.Database): number {
  const row = db.prepare(`SELECT AVG(weight) as avg FROM posting_time_weights`).get() as { avg: number | null };
  return row.avg ?? DEFAULT_WEIGHT;
}

// analyze-posting-timesの分析結果をまとめて反映する。
export function upsertWeights(db: Database.Database, entries: PostingTimeWeightEntry[]): void {
  const stmt = db.prepare(
    `INSERT INTO posting_time_weights (hour, weight, reason, updated_at)
     VALUES (@hour, @weight, @reason, CURRENT_TIMESTAMP)
     ON CONFLICT(hour) DO UPDATE SET
       weight = excluded.weight,
       reason = excluded.reason,
       updated_at = CURRENT_TIMESTAMP`
  );
  const insertAll = db.transaction((rows: PostingTimeWeightEntry[]) => {
    for (const row of rows) stmt.run(row);
  });
  insertAll(entries);
}
