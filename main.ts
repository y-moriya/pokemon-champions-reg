// ポケモンチャンピオンズ ランクバトルお知らせ収集スクリプト (CLI版)
// 実行方法: deno run --allow-net --allow-read --allow-write --unstable-kv main.ts

import "@std/dotenv/load";
import { PokemonChampionsScraper } from "./scraper.ts";
import { logger } from "./logger.ts";

// メイン処理
async function main() {
  const kv = await Deno.openKv();
  const scraper = new PokemonChampionsScraper(kv);
  const command = Deno.args[0] || "scrape";

  try {
    logger.info(`CLIコマンドの実行を開始: ${command}`, { command });

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
        logger.warn(`未知のコマンドが指定されました: ${command}`, { command });
        console.log("使用方法:");
        console.log("  deno run --allow-net --allow-read --allow-write --unstable-kv main.ts scrape");
        console.log("  deno run --allow-net --allow-read --allow-write --unstable-kv main.ts list");
        console.log("  deno run --allow-net --allow-read --allow-write --unstable-kv main.ts json");
        console.log("  deno run --allow-net --allow-read --allow-write --allow-env --unstable-kv main.ts deploy");
    }

    logger.info(`CLIコマンドが完了しました: ${command}`, { command });
  } catch (error) {
    logger.error(`CLIコマンド実行中にエラーが発生しました: ${command}`, error, { command });
    throw error;
  } finally {
    kv.close();
    await logger.flush();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (_error) {
    Deno.exit(1);
  }
}