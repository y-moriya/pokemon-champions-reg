# GEMINI.md - AIアシスタント向け開発・実行ガイド

このファイルは、AIアシスタント（Geminiなど）が本リポジトリの構造を理解し、開発、運用、メンテナンスをスムーズに行うためのガイドラインです。

## プロジェクトの目的
「ポケモンチャンピオンズ」のランクバトルに関する公式お知らせサイトからスクレイピングを行い、各シーズンと対応するレギュレーションの対応関係マップ（JSON）を自動生成し、Cloudflare Workers 上で API として配信・運用すること。

- **本番ドメイン**: https://pokemon-champions-reg.gunjobiyori.com

## ディレクトリ構成と主要ファイル
- [server.ts](file:///home/wellk/project/pokemon-champions-reg/server.ts): Cloudflare Workers / Hono を採用した API サーバーおよび Cron Triggers のエントリーポイント。
- [scraper.ts](file:///home/wellk/project/pokemon-champions-reg/scraper.ts): スクレイピングの実装クラス `PokemonChampionsScraper`。お知らせ一覧の取得、フィルタリング、個別ページのDOM解析、Cloudflare Workers KV への保存などの中核ロジックを持ちます。
- [logger.ts](file:///home/wellk/project/pokemon-champions-reg/logger.ts): Axiom Ingest API 対応の構造化ロガー。Cloudflare Workers, Node.js 両対応。
- [main.ts](file:///home/wellk/project/pokemon-champions-reg/main.ts): CLI 版の実行エントリーポイント（Cloudflare Workers API と連携）。
- [constants.ts](file:///home/wellk/project/pokemon-champions-reg/constants.ts): スクレイピング対象のURLなどの定数定義。
- [types.ts](file:///home/wellk/project/pokemon-champions-reg/types.ts): アプリケーション全体で使用するTypeScriptの型定義（Env含む）。
- [wrangler.toml](file:///home/wellk/project/pokemon-champions-reg/wrangler.toml): Cloudflare Workers の設定ファイル（KV バインディング、カスタムドメイン、Cron Triggers 設定）。

## データストア設計 (Cloudflare Workers KV)
データストアには Cloudflare Workers KV（バインディング名: `KV`、namespace: `pokemon-champions-reg-kv`）を使用します。

### 1. 個別お知らせデータ
- **キー**: `news:${url}`
- **値の型**: `RankBattleNews` (from `types.ts` を JSON 文字列化)

### 2. シーズン・レギュレーション対応マップ
- **キー**: `season_regulation_map`
- **値の型**: `Record<string, string>` (例: `{"M-1": "M-A", "M-2": "M-A"}`)

### 3. レギュレーション別参加可能ポケモンリスト
- **キー**: `regulation_pokemon:${regulation}`
- **値の型**: `PokemonInfo[]` (from `types.ts` を JSON 文字列化)

### 4. キャッシュデータ
- **キー**: `all_news` - 全お知らせ配列 (`RankBattleNews[]`)
- **キー**: `all_data` - 全部入り単一 JSON (`AllDataJson`)

## 主要タスクの実行方法 (pnpm)

```bash
# 依存関係のインストール
pnpm install

# ローカル開発サーバーの起動 (Wrangler dev)
pnpm run dev

# 型チェック
pnpm run typecheck

# 単体テスト (Vitest)
pnpm test

# Cloudflare Workers へのデプロイ
pnpm run deploy

# CLI 経由でのスクレイピング実行
pnpm run cli scrape

# CLI 経由での保存済みリスト取得
pnpm run cli list

# CLI 経由での全データJSON取得
pnpm run cli json
```

## AIアシスタントへの開発・改修指示

### 1. お知らせサイトのURL変更時
[constants.ts](file:///home/wellk/project/pokemon-champions-reg/constants.ts) の `LIST_JSON_URL` および `BASE_URL` を変更してください。

### 2. スクレイピング対象のタイトル・要素の変更時
お知らせのフォーマットが変わった場合は、[scraper.ts](file:///home/wellk/project/pokemon-champions-reg/scraper.ts) 内の以下の箇所を適宜調整してください。
- `filterRankBattleNews` 内のタイトル判定用の正規表現 `titlePattern`
- `extractSeason` および `extractRegulation` 内の正規表現抽出ロジック
- `extractPageContent` 内のDOMクエリ（現在は `div.article-body` 等を取得し、また「参加できるポケモン」というリンクテキストを元にURLを抽出しています）

### 3. ポケモンリストのフォーマット変更時
参加できるポケモン一覧のHTML構造やJavaScript内の変数名などが変わった場合は、[scraper.ts](file:///home/wellk/project/pokemon-champions-reg/scraper.ts) 内の `fetchPokemonList` メソッド内の正規表現やJSON解析ロジックを調整してください。

### 4. レート制限の考慮
スクレイパーはループごとに `setTimeout` で1000ms（1秒）の間隔を空けています。対象サーバーに負荷をかけないよう、このウェイトは削除しないでください。
