// ポケモンチャンピオンズ ランクバトルお知らせ収集スクリプト (CLI版)
// 実行方法: pnpm run cli [scrape|list|json|deploy]

import "dotenv/config";
import { logger } from "./logger.ts";

const API_BASE_URL =
  process.env.API_BASE_URL ||
  "https://pokemon-champions-reg.gunjobiyori.com";

async function main() {
  const command = process.argv[2] || "json";

  try {
    logger.info(`CLIコマンドの実行を開始: ${command}`, { command, target: API_BASE_URL });

    switch (command) {
      case "scrape": {
        const res = await fetch(`${API_BASE_URL}/api/scrape`, { method: "POST" });
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
        break;
      }

      case "list": {
        const res = await fetch(`${API_BASE_URL}/api/list`);
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
        break;
      }

      case "json": {
        const res = await fetch(`${API_BASE_URL}/api/json`);
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
        break;
      }

      case "deploy": {
        const res = await fetch(`${API_BASE_URL}/api/deploy`, { method: "POST" });
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
        break;
      }

      default:
        logger.warn(`未知のコマンドが指定されました: ${command}`, { command });
        console.log("使用方法:");
        console.log("  pnpm run cli scrape");
        console.log("  pnpm run cli list");
        console.log("  pnpm run cli json");
        console.log("  pnpm run cli deploy");
    }

    logger.info(`CLIコマンドが完了しました: ${command}`, { command });
  } catch (error) {
    logger.error(`CLIコマンド実行中にエラーが発生しました: ${command}`, error, { command });
    throw error;
  } finally {
    await logger.flush();
  }
}

main().catch(() => {
  process.exit(1);
});