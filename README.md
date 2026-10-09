# pokemon-champions-reg

ポケモンチャンピオンズ ランクバトルお知らせ収集ツール (Cloudflare Workers / Hono / pnpm)

ポケモンチャンピオンズの公式お知らせからランクバトルのシーズンとレギュレーションの対応表（Map）を生成・管理するリポジトリです。

- **本番URL**: https://pokemon-champions-reg.gunjobiyori.com

## 概要

指定されたポケモンチャンピオンズのお知らせページを巡回し、各ランクバトルシーズンの開始告知から「シーズン番号」と「レギュレーション（アルファベット）」および参加可能ポケモン一覧を抽出します。
抽出したデータは Cloudflare Workers KV に保存され、Hono を使った API サーバーとして配信されます。また、Cloudflare Cron Triggers による定期自動スクレイピングにも対応しています。

## 必要要件

- Node.js (v20 以上推奨)
- pnpm (v9 以上推奨)
- Cloudflare Wrangler (または `cf` CLI)

## セットアップ

```bash
# 依存関係のインストール
pnpm install
```

## 開発・デプロイ

```bash
# ローカル開発サーバー起動 (Miniflare / Workers ローカルエミュレータ)
pnpm run dev

# 型チェック
pnpm run typecheck

# 単体テスト実行 (Vitest)
pnpm test

# Cloudflare Workers へのデプロイ
pnpm run deploy
```

## CLI の使い方

```bash
# スクレイピングを実行
pnpm run cli scrape

# 保存済みニュース一覧を表示
pnpm run cli list

# 全体JSONを表示
pnpm run cli json
```

## API エンドポイント

- `GET /` - APIの説明およびエンドポイント一覧
- `POST /api/scrape` - スクレイピング処理を実行してKVを更新
- `GET /api/list` - 保存済みのニュース一覧を JSON で取得
- `GET /api/json` - シーズン情報とレギュレーション別ポケモン一覧をまとめた単一 JSON を取得
- `GET /api/pokemon` - 全レギュレーションのポケモン一覧を取得
- `GET /api/pokemon/:regulation` - 指定レギュレーションのポケモン一覧を取得
- `POST /api/deploy` - Netlify へのデプロイ処理を実行
