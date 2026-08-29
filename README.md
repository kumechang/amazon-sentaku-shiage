# amazon-sentaku-shiage

洗濯・仕上げ剤ジャンルのAmazonアフィリエイトを絡めたX自動投稿システム。

Claudeによる3段階パイプライン(戦略決定 → 投稿生成 → セルフチェック)で投稿候補を作成し、GitHub Issueでの人による承認を経てXに投稿する。承認モードは`config/app.json`の`approvalMode`で`"manual"` / `"auto"`を切り替え可能。

## セットアップ

```bash
npm install
cp .env.example .env
```

`.env`に以下を設定(ローカル実行時のみ必要。GitHub Actions上ではSecretsを使用):

- `ANTHROPIC_API_KEY`: Claude APIキー
- `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET`: X API v2(OAuth 1.0a user context)の認証情報
- `GITHUB_TOKEN` / `GITHUB_REPOSITORY`: ローカルからGitHub Issue操作を試す場合のみ

各キーが未設定でも処理は落ちず、ドライラン(ログ出力のみ)で動作する。

## 事前準備(必須)

- `config/account_info.md`: アカウントのペルソナ・トーンを記入(`{{account_info}}`としてプロンプトに渡る)
- `data/products.json`: 実際の商品を登録(サンプルは`active: false`のプレースホルダ)

## コマンド

```bash
npm run sync-products   # data/products.json をDBへ反映
npm run generate        # 投稿候補を1件生成し、GitHub Issueを作成
npm run handle-approval # GitHub Issueコメント(承認/却下)を処理(Actionsのissue_commentイベント経由で実行)
npm run collect-metrics # 投稿済みツイートのエンゲージメントを取得
npm run analyze-posting-times # エンゲージメント実績から時間帯ごとの投稿重みを算出
npm test                # ユニットテスト
npm run typecheck
```

## GitHub Actions

- `generate-posts.yml`: 投稿可能時間帯(`postingWindow`、既定JST 7〜23時)の間、毎時投稿候補の生成を試みる。実際に生成するかは`shouldGenerateNow`(1日の目標投稿数`targetPostsPerDay`・直近投稿からの間隔`minSpacingHours`・時間帯の重み)が判断するため、毎時起動してもClaude呼び出し(コスト)は目標水準に保たれる。`approvalMode: "auto"`かつセルフチェック合格時はその場で投稿。
- `handle-approval.yml`: Issueコメントに「承認」/「却下」と書かれたら処理(`pending-approval`ラベルが付いたIssueのみ反応)。
- `collect-metrics.yml`: 毎日、投稿済みツイートのエンゲージメントを取得し`post_metrics`に記録。
- `analyze-posting-times.yml`: 週1回、`post_metrics`を時間帯別に集計しClaudeに分析させ、`posting_time_weights`(反応の良い時間帯ほど高い重み)を更新する。データが少ない(投稿済み10件未満)うちは分析をスキップし、重みは既定の均等のまま。

いずれも`data/app.db`(SQLite)を実行後にbotコミットしてリポジトリに戻す。DB書き込みが競合しないよう`concurrency: db-write`グループを共有。

GitHub Actionsの`schedule`は数時間単位で遅延・スキップされることがある(GitHub側の既知の制限)。毎時起動にしているのはこの影響を緩和するためで、`generate-posts.yml`が深夜など不自然な時間帯(`postingWindow`の範囲外)に実行された場合は投稿候補を作らずスキップする。

### 必要なSecrets

- `ANTHROPIC_API_KEY`
- `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET`

`GITHUB_TOKEN`はActions上で自動付与される。
