-- data/products.json (人が手動編集する商品マスタ) をDBへ同期したもの。
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER, -- 手動登録のため陳腐化しうる。投稿文では断定的な価格表現をしない前提
  image_url TEXT,
  affiliate_url TEXT NOT NULL,
  category TEXT,
  tags TEXT, -- JSON配列を文字列として保存
  active INTEGER NOT NULL DEFAULT 1, -- 0にするとローテーション候補から外れる
  priority INTEGER NOT NULL DEFAULT 0, -- ローテーションで最終使用日時が同点だった場合のタイブレーク
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);

-- 生成された投稿候補1件につき1行。pending_approval -> approved/rejected -> posted/posted_dryrun/post_failed
-- というライフサイクルをstatusで管理する。
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'X',
  product_id INTEGER REFERENCES products(id),
  post_type TEXT,          -- strategy_json.post_type のコピー(検索・比率集計用)
  product_usage TEXT,      -- strategy_json.product_usage のコピー: none|natural|main
  strategy_json TEXT NOT NULL,   -- 戦略決定ステージの生JSON
  generated_text TEXT NOT NULL,  -- 投稿生成ステージの生テキスト(セルフチェック前)
  selfcheck_json TEXT NOT NULL,  -- セルフチェックステージの生JSON
  final_text TEXT NOT NULL,      -- 常にselfcheck_json.final_postを採用した最終候補本文
  self_check_score INTEGER,      -- selfcheck_json.score のコピー
  self_check_pass INTEGER,       -- selfcheck_json.pass のコピー(0/1)
  status TEXT NOT NULL DEFAULT 'pending_approval',
    -- pending_approval | approved | rejected | posted | posted_dryrun | post_failed
  github_issue_number INTEGER UNIQUE, -- 承認用Issueの番号。-1相当(未作成)はUNIQUE制約を避けNULLで扱う
  github_issue_url TEXT,
  approved_by TEXT,            -- 承認/却下コメントをしたGitHubユーザー名
  approval_comment_body TEXT,
  tweet_id TEXT,
  tweet_url TEXT,
  post_error TEXT,             -- 投稿失敗時のエラーメッセージ
  run_id TEXT,                 -- GitHub ActionsのRun ID(トレース用)
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  approved_at TEXT,
  posted_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_product ON posts(product_id);

-- 投稿ごとのエンゲージメントを「最新値で上書き」ではなくスナップショットとして時系列に蓄積する
-- (将来のフィードバックループ用。engagement_rateは記録時点で計算して保存)。
CREATE TABLE IF NOT EXISTS post_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  collected_at TEXT NOT NULL,
  impressions INTEGER,
  likes INTEGER,
  reposts INTEGER,
  replies INTEGER,
  bookmarks INTEGER,
  engagement_rate REAL
);
CREATE INDEX IF NOT EXISTS idx_metrics_post ON post_metrics(post_id);

-- 時間帯(JST 0-23時)ごとの投稿重み。週次のanalyze-posting-timesが更新する。
-- データ不足で未分析の時間帯はデフォルト1.0(均等)のまま残る。
CREATE TABLE IF NOT EXISTS posting_time_weights (
  hour INTEGER PRIMARY KEY, -- 0-23 (JST)
  weight REAL NOT NULL DEFAULT 1.0,
  reason TEXT,              -- Claudeが重みをそう判断した理由(監査用)
  updated_at TEXT
);

-- 他アカウントの投稿への返信候補。postsテーブルとはライフサイクル・フィールドが異なる
-- (相手の投稿情報を持つ)ため独立したテーブルにしている。
CREATE TABLE IF NOT EXISTS reply_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,              -- 'keyword' | 'watched_account'
  target_tweet_id TEXT NOT NULL UNIQUE, -- UNIQUE制約で同じ投稿への重複返信を防ぐ
  target_author_username TEXT NOT NULL,
  target_text TEXT NOT NULL,
  target_follower_count INTEGER,
  reply_text TEXT,                   -- should_reply=falseならNULL
  should_reply INTEGER NOT NULL,     -- Claudeの判断(0/1)
  skip_reason TEXT,                  -- should_reply=falseの理由
  status TEXT NOT NULL DEFAULT 'pending_approval',
    -- pending_approval | approved | rejected | posted | posted_dryrun | post_failed | skipped
  github_issue_number INTEGER UNIQUE,
  github_issue_url TEXT,
  approved_by TEXT,
  approval_comment_body TEXT,
  reply_tweet_id TEXT,
  reply_tweet_url TEXT,
  post_error TEXT,
  run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  approved_at TEXT,
  posted_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reply_candidates_status ON reply_candidates(status);
