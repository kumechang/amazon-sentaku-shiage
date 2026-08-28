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
npm test                # ユニットテスト
npm run typecheck
```

## GitHub Actions

- `generate-posts.yml`: 1日4回(JST 10/14/19/21時)投稿候補を生成しIssueを作成。`approvalMode: "auto"`かつセルフチェック合格時はその場で投稿。
- `handle-approval.yml`: Issueコメントに「承認」/「却下」と書かれたら処理(`pending-approval`ラベルが付いたIssueのみ反応)。
- `collect-metrics.yml`: 毎日、投稿済みツイートのエンゲージメントを取得し`post_metrics`に記録。

いずれも`data/app.db`(SQLite)を実行後にbotコミットしてリポジトリに戻す。DB書き込みが競合しないよう`concurrency: db-write`グループを共有。

### 必要なSecrets

- `ANTHROPIC_API_KEY`
- `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET`

`GITHUB_TOKEN`はActions上で自動付与される。
