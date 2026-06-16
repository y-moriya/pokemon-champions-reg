# pokemon-champions-reg

ポケモンチャンピオンズ ランクバトルお知らせ収集ツール

ポケモンチャンピオンズの公式お知らせからランクバトルのシーズンとレギュレーションの対応表（Map）を生成・管理するリポジトリです。
本リポジトリは [y-moriya/sv-reg](https://github.com/y-moriya/sv-reg) をベースに、ポケモンチャンピオンズ向けにカスタマイズしたものです。

## 概要

このツールは、指定されたポケモンチャンピオンズのお知らせページを巡回し、各ランクバトルシーズンの開始告知から「シーズン番号」と「レギュレーション（アルファベット）」を抽出します。
抽出したデータは Deno KV に保存され、最終的にシーズンとレギュレーションの対応を表す JSON マップ（`map.json`）を生成して Netlify にデプロイしたり、Hono を使った API サーバーとして配信したりできます。

## 必要要件

- [Deno](https://deno.com/) (v1.38.0 以上推奨 / `unstable-kv` 機能を使用します)

## セットアップ

`.env.example` をコピーして `.env` ファイルを作成し、Netlify のデプロイ設定など必要な環境変数を記述します。

```bash
cp .env.example .env
```

`.env` に記述する項目：
```env
NETLIFY_SITE_ID=your-netlify-site-id
NETLIFY_ACCESS_TOKEN=your-netlify-access-token
PORT=8000
```

※ お知らせの取得先URLは [constants.ts](file:///home/wellk/project/pokemon-champions-reg/constants.ts) に定義されています。必要に応じて変更してください。

## 使い方 (CLIコマンド)

Deno タスクとして登録されている各種コマンドを利用できます。

### 1. お知らせの収集・解析 (スクレイピング)
お知らせ一覧からランクバトルの告知を抽出し、個別ページからシーズン・レギュレーション情報を解析して Deno KV に保存します。
```bash
deno task scrape
```

### 2. 保存済みのお知らせ一覧表示
Deno KV にすでに保存されているお知らせデータの一覧を出力します。
```bash
deno task list
```

### 3. 対応マップの JSON 出力
収集したデータから `{"シーズン番号": "レギュレーション"}` の形式で JSON を標準出力に書き出します。
```bash
deno task json
```

### 4. Netlify へのデプロイ
最新データを収集した上で、`map.json` ファイルを Netlify にデプロイします。
```bash
deno task deploy
```

### 5. API サーバーの起動
Hono を使用した REST API サーバーを起動します。
```bash
deno task server
```

#### API エンドポイント
- `GET /` - APIの説明およびエンドポイント一覧
- `POST /api/scrape` - スクレイピング処理を実行
- `GET /api/list` - 保存済みのニュース一覧を JSON で取得
- `GET /api/json` - シーズン→レギュレーションマップを JSON で取得
- `POST /api/deploy` - Netlify へのデプロイ処理を実行
