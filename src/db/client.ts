import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = path.resolve(process.cwd(), "data/app.db");
const SCHEMA_PATH = path.resolve(process.cwd(), "schema.sql");

let db: Database.Database | undefined;

// data/app.dbへの接続を取得する。schema.sqlをCREATE TABLE IF NOT EXISTSで毎回適用するため、
// 別途マイグレーションツールを導入しなくてもスキーマが最新化される。
export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  // WALモードは使わない: ワークフローはプロセス終了ごとにdata/app.dbをそのままgitコミットするため、
  // -wal/-shm補助ファイルを残さず単一ファイルで完結させる。
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  // CREATE TABLE IF NOT EXISTSは既存テーブルへの列追加はしないため、
  // 既にテーブルが存在するDBに対してはここでガード付きALTERする。
  ensureColumn(db, "reply_candidates", "matched_keyword", "TEXT");
  ensureColumn(db, "reply_candidates", "selfcheck_json", "TEXT");
  ensureColumn(db, "reply_candidates", "self_check_score", "INTEGER");
  ensureColumn(db, "reply_candidates", "self_check_pass", "INTEGER");
  ensureColumn(db, "posts", "reply_kind", "TEXT");
  ensureColumn(db, "posts", "tip_text", "TEXT");
  ensureColumn(db, "posts", "tip_poll_options", "TEXT");
  ensureColumn(db, "posts", "tip_selfcheck_json", "TEXT");
  ensureColumn(db, "posts", "tip_self_check_score", "INTEGER");
  ensureColumn(db, "posts", "tip_self_check_pass", "INTEGER");
  ensureColumn(db, "posts", "tip_tweet_id", "TEXT");
  ensureColumn(db, "posts", "tip_tweet_url", "TEXT");

  return db;
}

function ensureColumn(db: Database.Database, table: string, column: string, ddlType: string): void {
  const exists = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(table, column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
  }
}
