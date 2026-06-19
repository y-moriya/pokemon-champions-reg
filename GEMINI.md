# GEMINI.md - AIアシスタント向け開発・実行ガイド

このファイルは、AIアシスタント（Geminiなど）が本リポジトリの構造を理解し、開発、運用、メンテナンスをスムーズに行うためのガイドラインです。

## プロジェクトの目的
「ポケモンチャンピオンズ」のランクバトルに関する公式お知らせサイトからスクレイピングを行い、各シーズンと対応するレギュレーションの対応関係マップ（JSON）を自動生成し、APIとして提供またはNetlifyにデプロイすること。

## ディレクトリ構成と主要ファイル
- [main.ts](file:///home/wellk/project/pokemon-champions-reg/main.ts): CLI版の実行エントリーポイント。引数によってスクレイピングやJSON出力、デプロイを行います。
- [server.ts](file:///home/wellk/project/pokemon-champions-reg/server.ts): Honoを採用したAPIサーバーのエントリーポイント。HTTPリクエスト経由で収集処理やデータの取得が可能です。
- [scraper.ts](file:///home/wellk/project/pokemon-champions-reg/scraper.ts): スクレイピングの実装クラス `PokemonChampionsScraper`。お知らせ一覧の取得、フィルタリング、個別ページのDOM解析、Deno KVへの保存などの中核ロジックを持ちます。
- [constants.ts](file:///home/wellk/project/pokemon-champions-reg/constants.ts): スクレイピング対象のURLなどの定数定義。
- [types.ts](file:///home/wellk/project/pokemon-champions-reg/types.ts): アプリケーション全体で使用するTypeScriptの型定義。

## データストア設計 (Deno KV)
データストアにはDeno標準の組み込みキーバリューストア（Deno KV）を使用します。

### 1. 個別お知らせデータ
- **キー**: `["news", url]`
- **値の型**: `RankBattleNews` (from `types.ts`)
  ```typescript
  interface RankBattleNews {
    url: string;
    title: string;
    season: string;
    regulation: string;
    pokemonLink?: string;
    startAt?: string;
    endAt?: string;
    fetchedAt: string;
  }
  ```

### 2. シーズン・レギュレーション対応マップ
- **キー**: `["season_regulation_map"]`
- **値の型**: `Record<string, string>` (例: `{"M-1": "M-A", "M-2": "M-A"}`)
- **備考**: CLIの `json` やデプロイされる `map.json`、および API `/api/json` の出力では、この対応マップの代わりに**全部入りの単一JSON構造（SeasonsとRegulationsの両方を含めたもの）**が提供されます。

#### 全部入りJSON構造
```json
{
  "seasons": [
    {
      "season": "M-1",
      "regulation": "M-A",
      "startAt": "2026-04-08",
      "endAt": "2026-05-13T10:59:00",
      "url": "https://..."
    }
  ],
  "regulations": {
    "M-A": [
      { "id": "0003-000", "name": "フシギバナ" }
    ]
  }
}
```

### 3. レギュレーション別参加可能ポケモンリスト
- **キー**: `["regulation_pokemon", regulation]`
- **値の型**: `PokemonInfo[]` (from `types.ts`)
  ```typescript
  interface PokemonInfo {
    id: string;
    name: string;
  }
  ```

## 主要タスクの実行方法

Denoタスク（`deno.json`）が定義されています。

```bash
# スクレイピングの実行 (KVストアに保存)
deno task scrape

# 保存されたお知らせの一覧表示
deno task list

# JSONマップの標準出力
deno task json

# NetlifyへのJSONデプロイ
deno task deploy

# Hono APIサーバーの起動 (ポートはPORT環境変数またはデフォルト8000)
deno task server
```

## AIアシスタントへの開発・改修指示

### 1. お知らせサイトのURL変更時
[constants.ts](file:///home/wellk/project/pokemon-champions-reg/constants.ts) の `LIST_JSON_URL` および `BASE_URL` を変更してください。

### 2. スクレイピング対象のタイトル・要素の変更時
お知らせのフォーマットが変わった場合は、[scraper.ts](file:///home/wellk/project/pokemon-champions-reg/scraper.ts) 内の以下の箇所を適宜調整してください。
- `filterRankBattleNews` 内のタイトル判定用の正規表現 `titlePattern`
- `extractSeason` および `extractRegulation` 内の正規表現抽出ロジック
- `extractPageContent` 内のDOMクエリ（現在は `div.main-text` 等を取得し、また「参加できるポケモン」というリンクテキストを元にURLを抽出しています）

### 3. ポケモンリストのフォーマット変更時
参加できるポケモン一覧のHTML構造やJavaScript内の変数名などが変わった場合は、[scraper.ts](file:///home/wellk/project/pokemon-champions-reg/scraper.ts) 内の `fetchPokemonList` メソッド内の正規表現やJSON解析ロジックを調整してください。

### 4. レート制限の考慮
スクレイパーはループごとに `setTimeout` で1000ms（1秒）の間隔を空けています。対象サーバーに負荷をかけないよう、このウェイトは削除しないでください。
