// ポケモンチャンピオンズ ランクバトルお知らせ収集スクリプト (CLI版)
// 実行方法: deno run --allow-net --allow-read --allow-write --unstable-kv main.ts

import "@std/dotenv/load";
import { PokemonChampionsScraper } from "./scraper.ts";

// メイン処理
async function main() {
  const kv = await Deno.openKv();
  const scraper = new PokemonChampionsScraper(kv);

  try {
    // 引数で動作を切り替え
    const command = Deno.args[0] || "scrape";

    switch (command) {
      case "scrape":
        // ランクバトルお知らせを収集
        await scraper.scrapeAll();
        break;

      case "list":
        // 保存済みのニュース一覧を表示
        await scraper.listSavedNews();
        break;

      case "json":
        // シーズン番号とレギュレーションをJSON形式で出力
        await scraper.outputJson();
        break;

      case "deploy":
        // NetlifyにJSONをデプロイ
        await scraper.deployToNetlify();
        break;

      default:
        console.log("使用方法:");
        console.log("  deno run --allow-net --allow-read --allow-write --unstable-kv main.ts scrape");
        console.log("  deno run --allow-net --allow-read --allow-write --unstable-kv main.ts list");
        console.log("  deno run --allow-net --allow-read --allow-write --unstable-kv main.ts json");
        console.log("  deno run --allow-net --allow-read --allow-write --allow-env --unstable-kv main.ts deploy");
    }
  } finally {
    kv.close();
  }
}

if (import.meta.main) {
  main();
}